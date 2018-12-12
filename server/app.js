const express = require('express');
const servgen = require('@abskmj/servgen');
const debug = require('debug');

const bot  = require('./bot');
const router = require('./routes/index');

const log = debug("app:main");

module.exports.init = async() => {
    // initialize services
    let app = new express();
    
    await servgen.init(app, __dirname + '/services');
    
    // attach bot
    bot(app);
    
    // attach routes
    app.use(router(app));
    
    app.listen(app.config.port);
    
    log('application listening on port', app.config.port);
}
