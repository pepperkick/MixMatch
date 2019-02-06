const log = require('debug')('app:models:match');

let cache = {};

module.exports = (schema) => {
    const statuses = Object.freeze({
        UNKNOWN: 'UNKNOWN',
        SETUP: 'SETUP',
        WAITING: 'WAITING',
        LIVE: 'LIVE',
        ENDED: 'ENDED',
        ERROR: 'ERROR'
    });
    
    schema.add({
        status: {
            type: String,
            enum: Object.values(statuses),
            default: statuses.UNKNOWN
        }
    });

    schema.statics.status = statuses;
};