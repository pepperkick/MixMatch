PrintToClientAll(String:str[]) {
    for (new i = 1; i < MaxClients; i++) {
        PrintToClient(i, str);
    }
}

PrintToClientTeam(int team, String:str[]) {
    for (new i = 1; i < MaxClients; i++) {
        if(IsClientInTeam(i, team)) {  
            PrintToClient(i, str);
        }
    }
}

PrintToClient(client, String:str[]) {
    if (IsClientProper(client)) {
        PrintToChat(client, "[%s] %s", TAG, str);
    }
}