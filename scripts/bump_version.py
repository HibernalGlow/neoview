import json
import re
import os

def update_version(new_version):
    # Update package.json
    package_json_path = r'd:\1VSCODE\Projects\ImageAll\NeeWaifu\neoview\neoview-tauri\package.json'
    with open(package_json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    data['version'] = new_version
    with open(package_json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Updated package.json to {new_version}")

    # Update tauri.conf.json
    tauri_conf_path = r'd:\1VSCODE\Projects\ImageAll\NeeWaifu\neoview\neoview-tauri\src-tauri\tauri.conf.json'
    with open(tauri_conf_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    data['version'] = new_version
    with open(tauri_conf_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Updated tauri.conf.json to {new_version}")

    # Update Cargo.toml
    cargo_toml_path = r'd:\1VSCODE\Projects\ImageAll\NeeWaifu\neoview\neoview-tauri\src-tauri\Cargo.toml'
    with open(cargo_toml_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Use regex to find version = "x.y.z" in the [package] section
    # Usually it's the first occurrence
    new_content = re.sub(r'(^name\s*=\s*"neoview".*?\nversion\s*=\s*")\d+\.\d+\.\d+(")', rf'\g<1>{new_version}\g<2>', content, flags=re.MULTILINE | re.DOTALL)
    
    with open(cargo_toml_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Updated Cargo.toml to {new_version}")

if __name__ == "__main__":
    update_version("5.6.6")
