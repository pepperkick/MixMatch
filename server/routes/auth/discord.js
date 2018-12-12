const passport = require('passport');
const DiscordStrategy = require('passport-discord');
const SteamID = require('steamid');

module.exports = (app) => {
    router.use(Passport.initialize());

    passport.use(new DiscordStrategy({
        clientID: app.config.discord.client_id,
        clientSecret: app.config.discord.client_secret,
        callbackURL: `http://${app.config.host}:${app.config.port}/auth/discord/return`,
        scope: app.config.discord.scope
      },
      async (accessToken, refreshToken, profile, done) => {
        const Player = app.connection.model('Player');
        const Discord = app.discord;
  
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
            return Discord.sendDm(profile.id, {
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
          log(`Discord: ${user.id}`);
          log(`Steam: ${user.steam}`);
  
          Discord.assignRole(profile.id, config.guild, config.roles.player);
  
          Discord.sendDm(profile.id, {
            text: "Thank you for registering with us!"
          });
  
          return done(null, profile);
        }
  
        Discord.sendDm(profile.id, {
          text: "You need to connect your steam account with discord to continue."
        });
  
        done("No steam connection", null);
  
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

    return router;
}