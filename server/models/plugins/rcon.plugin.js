const log = require("debug")("app:models:plugins:rcon");

module.exports = (schema, options) => {
    const app = options.app;

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

        const that = this;
        this.rconConn = await app.rcon.createRconConnection(ip, port, password);

        this.model(this.constructor.modelName).emit("rcon_connected", this);

        this.rconConn.onDidDisconnect(function () {
            that.model(that.constructor.modelName).emit("rcon_disconnected", that);
        });

        return this.rconConn;
    }
    
    schema.methods.retryRconConnection = async function () {
        try {
            this.rconConn = await this.createRconConnection();
        } catch (error) {
            log(error);
            this.model(this.constructor.modelName).emit("rcon_error", this);
        }
    };

    schema.methods.getRconConnection = function () {
        return app.rcon.get(this.ip, this.port);
    };

    schema.methods.disconnectRconConnection = async function () {
        await app.rcon.disconnect(this.ip, this.port);
    }

    schema.statics.disconnectAllRconConnection = async function () {
        await app.rcon.disconnectAll();
    }

    schema.virtual("isRconConnected").get(function () {
        return this.getRconConnection() !== undefined;
    });
}