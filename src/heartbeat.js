'use strict';

const os = require('os');
const redisKeys = require('./redis-keys');
const redisClient = require('./redis-client');
const events = require('./events');

const cpuUsageStats = {
    cpuUsage: process.cpuUsage(),
    time: process.hrtime()
};

// convert hrtime to milliseconds
function hrtime(time) {
    return time[0] * 1e3 + time[1] / 1e6;
}

// convert (user/system) usage time from micro to milliseconds
function usageTime(time) {
    return time / 1000;
}

function cpuUsage() {
    const currentTimestamp = process.hrtime();
    const currentCPUUsage = process.cpuUsage();
    const timestampDiff = process.hrtime(cpuUsageStats.time);
    const cpuUsageDiff = process.cpuUsage(cpuUsageStats.cpuUsage);
    cpuUsageStats.time = currentTimestamp;
    cpuUsageStats.cpuUsage = currentCPUUsage;
    return {
        percentage: ((usageTime(cpuUsageDiff.user + cpuUsageDiff.system) / hrtime(timestampDiff)) * 100).toFixed(1),
        ...cpuUsageDiff
    };
}

function getIPAddresses() {
    const nets = os.networkInterfaces();
    const addresses = [];
    for (const name in nets) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                addresses.push(net.address);
            }
        }
    }
    return addresses;
}

function getHeartBeatIndexName(queueName, consumerId) {
    const ns = redisKeys.getNamespace();
    return `${ns}|${queueName}|${consumerId}`;
}

/**
 *
 * @param {Instance} instance
 */
function HeartBeat(instance) {
    const queueName = instance.getQueueName();
    const instanceId = instance.getId();
    const { keyHeartBeat } = instance.getInstanceRedisKeys();
    const states = {
        UP: 1,
        DOWN: 0
    };
    let redisClientInstance = null;
    let state = states.DOWN;
    let timer = null;
    let shutdownNow = null;

    function beat() {
        if (state === states.UP) {
            const usage = {
                ipAddress: getIPAddresses(),
                hostname: os.hostname(),
                pid: process.pid,
                ram: {
                    usage: process.memoryUsage(),
                    free: os.freemem(),
                    total: os.totalmem()
                },
                cpu: cpuUsage()
            };
            const timestamp = Date.now();
            const payload = JSON.stringify({
                timestamp,
                usage
            });
            const hashKey = getHeartBeatIndexName(queueName, instanceId);
            redisClientInstance.hset(keyHeartBeat, hashKey, payload, (err) => {
                if (err) instance.error(err);
                else {
                    timer = setTimeout(() => {
                        if (shutdownNow) shutdownNow();
                        else beat();
                    }, 1000);
                }
            });
        }
    }

    return {
        start() {
            if (state === states.DOWN) {
                state = states.UP;
                redisClient.getNewInstance(instance.getConfig(), (c) => {
                    redisClientInstance = c;
                    beat();
                    instance.emit(events.HEARTBEAT_UP);
                });
            }
        },

        stop() {
            if (state === states.UP && !shutdownNow) {
                shutdownNow = () => {
                    state = states.DOWN;
                    shutdownNow = null;
                    if (timer) clearTimeout(timer);
                    const hashKey = getHeartBeatIndexName(queueName, instanceId);
                    redisClientInstance.hdel(keyHeartBeat, hashKey, (err) => {
                        if (err) instance.error(err);
                        else {
                            redisClientInstance.end(true);
                            redisClientInstance = null;
                            instance.emit(events.HEARTBEAT_DOWN);
                        }
                    });
                };
            }
        }
    };
}

/**
 *
 * @param {object} params
 * @param {object} params.client
 * @param {string} params.ns
 * @param {string} params.queueName
 * @param {string} params.id
 * @param {function} cb
 */
HeartBeat.isOnline = function isOnline(params, cb) {
    const { client, queueName, id } = params;
    const keys = redisKeys.getCommonKeys();
    const hashKey = getHeartBeatIndexName(queueName, id);

    const noop = () => {};
    client.hget(keys.keyHeartBeat, hashKey, (err, res) => {
        if (err) cb(err);
        else {
            let online = false;
            if (res) {
                const now = Date.now();
                const payload = JSON.parse(res);
                const { timestamp } = payload;
                online = now - timestamp <= 10000;
                cb(null, online);

                // Do not wait for keys deletion, reply as fast as possible
                if (!online) client.hdel(keys.keyHeartBeat, hashKey, noop);
            } else {
                cb(null, online);
            }
        }
    });
};

/**
 *
 * @param {object} client
 * @param {function} cb
 */
HeartBeat.getOnlineConsumers = function getOnlineConsumers(client, cb) {
    const rKeys = redisKeys.getCommonKeys();
    const data = {
        queues: {}
    };
    const deadConsumers = [];
    const noop = () => {};
    client.hgetall(rKeys.keyHeartBeat, (err, result) => {
        if (err) cb(err);
        else if (result) {
            const now = Date.now();
            for (const hashKey in result) {
                const { timestamp, usage: resources } = JSON.parse(result[hashKey]);
                if (now - timestamp <= 10000) {
                    const [ns, queueName, consumerId] = hashKey.split('|');
                    if (!data.queues[ns]) {
                        data.queues[ns] = {};
                    }
                    if (!data.queues[ns][queueName]) {
                        data.queues[ns][queueName] = {
                            consumers: {}
                        };
                    }
                    if (!data.queues[ns][queueName].consumers[consumerId]) {
                        data.queues[ns][queueName].consumers[consumerId] = {
                            id: consumerId
                        };
                    }
                    data.queues[ns][queueName].consumers[consumerId].resources = resources;
                } else deadConsumers.push(hashKey);
            }
            // Do not wait for keys deletion, reply as fast as possible
            if (deadConsumers.length) client.hdel(rKeys.keyHeartBeat, ...deadConsumers, noop);
            cb(null, data);
        } else cb(null, data);
    });
};

module.exports = HeartBeat;
