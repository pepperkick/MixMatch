const express = require('express');

const log = require('debug')('app:routes');

module.exports = (app) => {    
    let router = express.Router();

    // discord auth
    router.post('/auth/discord', require('./auth/discord')(app));

    log('loading routes');
    
    return router;
}
