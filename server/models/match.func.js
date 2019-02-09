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

    schema.statics.isPlayerAssigned = async function (id) {
        const matches = this.find({ status: statuses.WAITING });

        for await (let match of matches) {
            if (await match.isPlayerIn(id)) return match;
        }

        return null;
    }

    schema.statics.isPlayerPlaying = async function (id) {
        const matches = this.find({ status: statuses.LIVE });

        for await (let match of matches) {
            if (await match.isPlayerIn(id)) return match;
        }

        return null;
    }

    schema.methods.isPlayerIn = async function (id) {
        if (this.players.includes(id)) return match;
        return null;
    }

    schema.methods.setStatus = async function (status) {
        this.status = status;
        
        await this.save();
        
        log(`Match ${this.id}'s status changed to ${this.status}`);
    }

    schema.methods.handleMapChange = async function (event) {
        const { map } = event.data;

        if (this.status === statuses.SETUP && this.map === map) {
            await match.setStatus(statuses.WAITING);
        } else if (this.status === statuses.WAITING && this.map !== map) {
            await match.setStatus(statuses.SETUP);
        } else if (this.status === statuses.LIVE && this.map !== map) {
            await match.setStatus(statuses.ERROR);

            throw new Error("Map changed in the middle of a live match");
        }
    }
};