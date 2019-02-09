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

        for (let i in matches) {
            if (await matches[i].isPlayerIn(id)) return match;
        }

        return null;
    }

    schema.statics.isPlayerPlaying = async function (id) {
        const matches = this.find({ status: statuses.LIVE });

        for (let i in matches) {
            if (await matches[i].isPlayerIn(id)) return match;
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
        const Server = await this.model('Server');
        const formats_config = this.getConfigValue(`formats`);
        const format = formats_config[this.format];
        const { map } = event.data;

        if (this.status === statuses.SETUP && this.map === map) {
            const server = await Server.findById(this.server);

            await server.execConfig(format.config);

            await this.setStatus(statuses.WAITING);
        } else if (this.status === statuses.WAITING && this.map !== map) {
            await this.setStatus(statuses.SETUP);
        } else if (this.status === statuses.LIVE && this.map !== map) {
            await this.setStatus(statuses.ERROR);

            throw new Error("Map changed in the middle of a live match");
        }
    }
};