# MixMatch

A project that creates mixes and pugs for TF2 and CSGO via discord

## Components

- Server
- Discord
- Sourcemod
- Testings

## Requirements

- Plugin
  - Sourcemod (>= v1.9.0)
  - Socket Extension

## Bot Config

All values of `config.json` must be filled for the bot to work properly

## Game Server Config

The plugin for this bot executes certain configs after a map is loaded

```
    exec mixmatch/maps/<map prefix>
    exec mixmatch/maps/<map name>
    exec mixmatch/maps/<map name>-<format>
    exec mixmatch/configs/<format>
    exec mixmatch/configs/<format>-<map prefix>
```

Example: If queue format is `ugc-6v6` and server map is switched to `cp_process` then following configs will be executed by plugin and mentioned order

```
    exec mixmatch/maps/cp
    exec mixmatch/maps/cp_process
    exec mixmatch/maps/cp_process-ugc-6v6
    exec mixmatch/configs/ugc-6v6
    exec mixmatch/configs/ugc-6v6-cp
```