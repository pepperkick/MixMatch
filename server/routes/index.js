const express = require('express');

const log = require('debug')('app:routes');

module.exports = (app) => {    
    const router = express.Router();

    // discord auth
    router.use('/auth/discord', require('./auth/discord')(app));
    // router.use('/plugin', require('./api/plugin')(app));

    log('loading routes');

    return router;
}
