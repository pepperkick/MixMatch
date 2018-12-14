#if defined GAME_TF2
#define TEAM_NIL 0
#define TEAM_RED 2
#define TEAM_BLU 3

#define PANEL_CLASS_RED "class_red"
#define PANEL_CLASS_BLU "class_blue"
#endif

#if defined GAME_CSGO
#define TEAM_T  2
#define TEAM_CT 3
#endif

#define STATE_UNKNOWN   0
#define STATE_FREE      1
#define STATE_SETUP     2
#define STATE_WAITING   3
#define STATE_LIVE      4
#define STATE_END       5

// Core Includes
#include <sourcemod>
#include <morecolors>
#include <sdktools>
#include <httpreq>

#include <cvars>

#if defined GAME_TF2
#include <match>
#include <games/tf2>
#endif

#if defined GAME_CSGO
#include <cstrike>
#include <games/csgo>
#endif