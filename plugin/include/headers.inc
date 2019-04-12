#if defined GAME_TF2
#define TEAM_NIL 0
#define TEAM_RED 2
#define TEAM_BLU 3
#define TEAM_SPC 4

#define PANEL_CLASS_RED "class_red"
#define PANEL_CLASS_BLU "class_blue"
#endif

#if defined GAME_CSGO
#define TEAM_T   2
#define TEAM_CT  3
#define TEAM_SPC 4
#endif

#define TEAM_1 2
#define TEAM_2 3

// Core Includes
#include <sourcemod>
#include <morecolors>
#include <sdktools>

#include <libs/hud>
#include <libs/announce>
#include <libs/player>

#include <cvars>

#if defined GAME_TF2
#include <libs/minhud>

#include <match>
#include <games/tf2>
#endif

#if defined GAME_CSGO
#include <cstrike>
#include <games/csgo>
#endif