const env = process.env.NODE_ENV;

let config

if (env) {
    const path = `../../config.${env}.json`;
    config = require(path);
} else {
    config = require('../../config.json');
}

module.exports = () => {
    return config;
}
