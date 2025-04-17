import { get_skins, get_uuids_objects } from "./mojang_api.js"
import fs from 'fs';
import nj from 'nunjucks';
import fetch from 'node-fetch';
import { imageSizeFromFile } from 'image-size/fromFile';
import path, {dirname} from 'path';
import { zip } from 'zip-a-folder';
import { fileURLToPath } from 'url';

export const generate_pack = async (mc_names: string[], gen_id: string) => {
    console.log("Generating pack for: ", mc_names);
    const uuids = await get_uuids_objects(mc_names);
    if (!uuids) return null;
    const skins = await get_skins(uuids.map((uuid) => uuid.id));
    if (!skins) return null;
    const item = "carved_pumpkin";

    const _dirname = path.join(dirname(fileURLToPath(import.meta.url)));
    
    //create skin pack folder
    const temp_dir = fs.mkdtempSync("temp-pack-");
    fs.writeFileSync(`${temp_dir}/pack.mcmeta`, nj.render(path.join(_dirname, "../templates/pack_mcmeta.njk")));
    await make_dir_async(`${temp_dir}/assets/`);
    await make_dir_async(`${temp_dir}/assets/minecraft/`);
    await make_dir_async(`${temp_dir}/assets/minecraft/items/`);
    await make_dir_async(`${temp_dir}/assets/skin_pack`);
    await make_dir_async(`${temp_dir}/assets/skin_pack/models`);
    await make_dir_async(`${temp_dir}/assets/skin_pack/models/item`);
    await make_dir_async(`${temp_dir}/assets/skin_pack/textures`);
    await make_dir_async(`${temp_dir}/assets/skin_pack/textures/item`);

    const names = [];

    for(const uuid_obj of uuids){
        const name = uuid_obj.name.toLowerCase();
        const skin_url = skins[uuids.indexOf(uuid_obj)];

        const res = await fetch(skin_url.textures.SKIN.url);
        if (!res.ok) return null;
        const skin_path = `${temp_dir}/assets/skin_pack/textures/item/${name}.png`;
        const stream = res.body.pipe(fs.createWriteStream(skin_path));
        const model_size = await new Promise((resolve, reject) => {
            stream.on('finish', async () => {
                const img_size = await imageSizeFromFile(skin_path);
                if(img_size.height == 32) return resolve("old");
                else if(!skin_url.textures.SKIN.metadata) return resolve("normal");
                else return resolve("slim");
            });
        });

        names.push(name);
        fs.copyFileSync(path.join(_dirname, "../templates/" + model_size + ".json"), `${temp_dir}/assets/skin_pack/models/item/${name}.json`);
        let file = fs.readFileSync(`${temp_dir}/assets/skin_pack/models/item/${name}.json`);
        let file_content = file.toString().replace("./player", "skin_pack:item/"+name)
        file_content = file_content.replace("./player", "skin_pack:item/"+name)
        fs.writeFileSync(`${temp_dir}/assets/skin_pack/models/item/${name}.json`, file_content);
    }
    fs.writeFileSync(`${temp_dir}/assets/minecraft/items/${item}.json`, nj.render(path.join(_dirname, "../templates/item_model.njk"), { names: names, item: item }));

    await make_dir_async(path.join(_dirname, `../ziped_skins/${gen_id}`));
    await zip(temp_dir, path.join(_dirname, `../ziped_skins/${gen_id}/skin_pack.zip`));
    fs.rmSync(temp_dir, { recursive: true, force: true });
    console.log("Pack generated: ", gen_id);
}

const make_dir_async = async (path: string) => {
    return new Promise((resolve, reject) => {
        fs.mkdir(path, { recursive: true }, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve(true);
            }
        });
    });
}