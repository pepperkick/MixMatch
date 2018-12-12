const express = require('express');
const passport = require('passport');
const DiscordStrategy = require('passport-discord');
const SteamID = require('steamid');

const log = require('debug')('app:routes:auth:discord');

module.exports = (app) => {
    const router = express.Router();

    router.use(passport.initialize());

    passport.use(new DiscordStrategy({
        clientID: app.config.discord.client_id,
        clientSecret: app.config.discord.client_secret,
        callbackURL: `http://${app.config.host}:${app.config.port}/auth/discord/return`,
        scope: app.config.discord.scope
      },
      async (accessToken, refreshToken, profile, done) => {
        const Player = app.connection.model('Player');
        const Discord = app.discord;
        const DMChannel = await Discord.getDMChannel(profile.id);
  
        log(accessToken);
        log(refreshToken);
        log(profile);
  
        let player = await Player.findByDiscord(profile.id);
  
        if (player) {
          return done(null, profile);
        }
  
        const steamIDs = [];
  
        for (const connection of profile.connections) {
          if (connection.type === 'steam') {
            steamIDs.push(connection.id);
          }
        }
  
        if (steamIDs.length > 0) {
          const prevPlayers = await Player.find({ where: { steam: steamIDs[0] }});
  
          if (prevPlayers.length !== 0) {
            return Discord.sendDm(DMChannel, {
              text: "An user already exists with the connected steam id, if you are the owner of steam account or cannot access your original discord account then please contact admin to resolve this issue."
            });
          }
  
          let sid = new SteamID(steamIDs[0]);
          sid.instance = SteamID.Instance.DESKTOP // 1
  
          const newPlayer = new Player({
            discord: profile.id,
            steam: sid.getSteamID64()
          });
  
          await newPlayer.save();
  
          log(`Saved new user ${profile.username}`);
          log(`Discord: ${newPlayer.id}`);
          log(`Steam: ${newPlayer.steam}`);
  
          Discord.assignRole(profile.id, app.config.discord.guild, app.config.discord.roles.player);
  
          Discord.sendToChannel(DMChannel, {
            text: "Thank you for registering with us!"
          });
  
          return done(null, profile);
        }
  
        Discord.sendDm(DMChannel, {
          text: "You need to connect your steam account with discord to continue."
        });
  
        done("No steam connection", null);
  
        // TODO: Handle multiple steam connections (Discord menu system has to be made)
      }
    ));
  
    router.get(['/', '/return'], (req, res, next) => {
        passport.authenticate('discord', function(err, user, info) {
            if (user) {
                res.send('Success, you can close this window now!');
            }
        }) (req, res, next);
    });

    return router;
}