const passport = require('passport');
const DiscordStrategy = require('passport-discord');
const SteamID = require('steamid');

module.exports = (app) => {
    passport.use(new DiscordStrategy({
        clientID: app.config.discord.client_id,
        clientSecret: app.config.discord.client_secret,
        callbackURL: `http://${app.config.host}:${app.config.port}/auth/discord/return`,
        scope: app.config.discord.scope
      },
      async (accessToken, refreshToken, profile, done) => {
        // const Player = app.models.Player;
        // const Discord = app.services.Discord;
  
        // log(accessToken);
        // log(refreshToken);
        // log(profile);
  
        // let user = await Player.findById(profile.id);
  
        // if (user) {
        //   return done(null, profile);
        // }
  
        // const steamIDs = [];
  
        // for (const connection of profile.connections) {
        //   if (connection.type === 'steam') {
        //     steamIDs.push(connection.id);
        //   }
        // }
  
        // if (steamIDs.length === 1) {
        //   user = await Player.find({ where: { steam: steamIDs[0] }});
  
        //   if (user.length !== 0) {
        //     return Discord.sendDm(profile.id, {
        //       text: "An user already exists with the connected steam id, if you are the owner of steam account or cannot access your original discord account then please contact admin to resolve this issue."
        //     });
        //   }
  
        //   let sid = new SteamID(steamIDs[0]);
        //   sid.instance = SteamID.Instance.DESKTOP // 1
  
        //   user = new Player({
        //     id: profile.id,
        //     steam: sid.getSteamID64()
        //   });
  
        //   await user.save();
  
        //   log(`Saved new user ${profile.username}`);
        //   log(`Discord: ${user.id}`);
        //   log(`Steam: ${user.steam}`);
  
        //   Discord.assignRole(profile.id, config.guild, config.roles.player);
  
        //   Discord.sendDm(profile.id, {
        //     text: "Thank you for registering with us!"
        //   });
  
        //   return done(null, profile);
        // }
  
        // Discord.sendDm(profile.id, {
        //   text: "You need to connect your steam account with discord to continue."
        // });
  
        // done("No steam connection, you need to connect your steam account with discord", null);
  
        // TODO: Handle multiple steam connections (Discord menu system has to be made)
      }
    ));
  
    router.get(['/', '/return'], (req, res, next) => {
        Passport.authenticate('discord', function(err, user, info) {
            if (user) {
                res.send('Success, you can close this window now!');
            }
        }) (req, res, next);
    });
}