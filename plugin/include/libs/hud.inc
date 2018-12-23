int g_iHudR = 0;
int g_iHudG = 0;
int g_iHudB = 0;

Handle HudInit(l_iR, l_iG, l_iB) {
    HudSetColor(l_iR, l_iG, l_iB);

    return CreateHudSynchronizer();
}

HudSetColor(l_iR, l_iG, l_iB) {
    g_iHudR = l_iR;
    g_iHudG = l_iG;
    g_iHudB = l_iB;
}

PrintToHudAll(Handle hud, String:str[]) {
    for (new i = 1; i < MaxClients; i++) {
        PrintToHud(hud, i, str);
    }
}

PrintToHud(Handle hud, client, String:str[]) {
    SetHudTextParams(-1.0, -1.0, 20.0, g_iHudR, g_iHudG, g_iHudB, 255);

    if (IsClientProper(client)) {
        ShowSyncHudText(client, hud, "%s", str);
    }
}

HudSetText(Handle hud, String:str[]) {
    SetHudTextParams(-1.0, -1.0, 20.0, g_iHudR, g_iHudG, g_iHudB, 255);

    for (new i = 1; i < MaxClients; i++) {
        if (IsClientProper(i)) {
            ShowSyncHudText(i, hud, "%s", str);
        }
    }
}