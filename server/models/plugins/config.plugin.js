module.exports = (schema, options) => {    
    const app = options.app;

    schema.methods.getConfigValue = function (key) {
        if (!app.config) throw new Error("Config service is not attached to app");

        return app.config[key];
    }

    schema.methods.getConfig = function () {
        if (!app.config) throw new Error("Config service is not attached to app");

        return app.config;
    }
}