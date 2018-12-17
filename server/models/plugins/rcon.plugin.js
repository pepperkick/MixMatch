module.exports = (schema, options) => {
    const app = options.app;
    let cache = {};

    schema.virtual("rconConn").get(function () {
        return this.getRconConnection();
    });

    schema.methods.createRconConnection = async function () {
        let ip = this.ip || this[options.ip];
        let port = this.port || this[options.port];
        let password = this.rcon || this[options.password];

        if (!app.rcon) throw new Error("RCON service is not attached to app");

        if (!ip) throw new Error("RCON ip is not present");
        if (!port) throw new Error("RCON port is not present"); 
        if (!password) throw new Error("RCON password is not present");

        if (cache[`${ip}:${port}`]) return cache[`${ip}:${port}`];

        const that = this;
        const rcon = await app.rcon.createRconConnection(ip, port, password);

        cache[`${ip}:${port}`] = rcon;

        this.rconConn = rcon;
        this.model(this.constructor.modelName).emit("rcon_connected", this);

        rcon.onDidDisconnect(function () {
            that.model(that.constructor.modelName).emit("rcon_disconnected", that);
        });

        return rcon
    }
    
    schema.methods.retryRconConnection = async function () {
        try {
            this.rconConn = await this.createRconConnection();
            this.model(this.constructor.modelName).emit("rcon_connected", this);
        } catch (error) {
            this.model(this.constructor.modelName).emit("rcon_error", this);
        }
    };

    schema.methods.getRconConnection = function () {
        return cache[`${this.ip}:${this.port}`];
    };

    schema.methods.disconnectRconConnection = async function () {
        await cache[`${this.ip}:${this.port}`].disconnect();
    }

    schema.statics.disconnectAllRconConnection = async function () {
        for (const key in cache) {
            await cache[key].disconnect();
        }

        cache = {};
    }

    schema.post('init', async doc => {
        try {
            await doc.createRconConnection();
        } catch (error) {
            doc.model(doc.constructor.modelName).emit("rcon_error", doc);
        }
    });
}