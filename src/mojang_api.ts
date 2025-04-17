import fetch from 'node-fetch';


export const get_skins = async (uuids: string[]) => {
    const skin_urls = [];
    for (const uuid of uuids) {
        const url = `https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`;
        const res = await fetch(url);
        if (!res.ok) {
            console.error("Error getting uuids: ", res.status, res.statusText);
            console.error("Response: ", await res.text());
            return null;
        }
        await wait(1050); // wait 1 second to avoid rate limit
        const data = await res.json();
        const skin_data = JSON.parse((Buffer.from(data.properties[0].value, 'base64').toString('ascii')));
        skin_urls.push(skin_data);
    }
    return skin_urls;
}

export const get_uuids_objects = async (names: string[]) => {
    const name_lists = [];
    if(names.length > 10){
        for(let i = 0; i < names.length; i+=10){
            name_lists.push(names.slice(i, i+10));
        }
    }else{
        name_lists.push(names);
    }
    const uuids = [];
    const url = `https://api.minecraftservices.com/minecraft/profile/lookup/bulk/byname`;
    for (const name_list of name_lists) {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(name_list)
        })
        if (!res.ok) {
            console.error("Error getting uuids: ", res.status, res.statusText);
            console.error("Response: ", await res.text());
            return null;
        }
        const data = await res.json();
        uuids.push(...data);
        await wait(1050); // wait 1 second to avoid rate limit
    }
    return uuids;
}

const wait = async (ms: number) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
}