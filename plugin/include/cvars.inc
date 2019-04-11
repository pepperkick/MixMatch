
Handle g_hcRestrictPlayers = INVALID_HANDLE;

public CreateCvars() {
    //Plugin Version ConVar
    CreateConVar(
        "mixmatch_version",
        PLUGIN_VERSION,
        "MixMatch Plugin Version",
        FCVAR_SPONLY | FCVAR_REPLICATED | FCVAR_NOTIFY
    );

    // CVar to whether restrict players or not
    g_hcRestrictPlayers =
        CreateConVar(
            "mx_restrict_players",
            "1",
            "Should unknown players be restricted from joining the server?",
            FCVAR_NOTIFY | FCVAR_DONTRECORD
        );
}