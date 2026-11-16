import json, os, time, urllib.request

USER_AGENT_API = 'AntigravityAmbush/1.0 (r1mob2@hotmail.com)'
USER_AGENT_IMG = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

def download_commons_image(file_title, dest_path, width=1600):
    os.makedirs(os.path.dirname(os.path.abspath(dest_path)), exist_ok=True)
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 10000:
        print(f"Already cached: {dest_path}")
        return True
    
    clean_title = file_title if file_title.startswith("File:") else f"File:{file_title}"
    api_url = f"https://commons.wikimedia.org/w/api.php?action=query&titles={urllib.parse.quote(clean_title)}&prop=imageinfo&iiprop=url&iiurlwidth={width}&format=json"
    
    try:
        req = urllib.request.Request(api_url, headers={'User-Agent': USER_AGENT_API})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.load(resp)
            pages = data.get('query', {}).get('pages', {})
            page = list(pages.values())[0]
            if 'imageinfo' not in page:
                print(f"Missing imageinfo for {file_title}")
                return False
            thumb_url = page['imageinfo'][0].get('thumburl', page['imageinfo'][0].get('url'))
            
        time.sleep(1) # courteous rate limit
        req2 = urllib.request.Request(thumb_url, headers={
            'User-Agent': USER_AGENT_IMG,
            'Referer': 'https://commons.wikimedia.org/'
        })
        with urllib.request.urlopen(req2, timeout=15) as resp2, open(dest_path, 'wb') as out:
            out.write(resp2.read())
            
        print(f"SUCCESS: {file_title} -> {dest_path} ({os.path.getsize(dest_path)} bytes)")
        return True
    except Exception as e:
        print(f"FAIL: {file_title} - {e}")
        return False

if __name__ == "__main__":
    test_files = [
        ("File:Plumber 01.jpg", "pool_downloads/plumber_01.jpg"),
        ("File:Propane torch soldering copper pipe.jpg", "pool_downloads/propane_torch_soldering.jpg"),
        ("File:Thermostatic Radiator Valve.jpg", "pool_downloads/thermostatic_radiator_valve.jpg"),
        ("File:Public domain image - underfloor heating installation.JPG", "pool_downloads/underfloor_heating_pd.jpg"),
        ("File:Plumber uses two wrenches to tighten a fitting.jpg", "pool_downloads/plumber_two_wrenches.jpg"),
        ("File:Wall mounted boiler in kitchen.jpg", "pool_downloads/wall_mounted_boiler.jpg"),
        ("File:Heizkreisverteiler.jpg", "pool_downloads/underfloor_manifold_de.jpg")
    ]
    for title, dest in test_files:
        download_commons_image(title, dest)
        time.sleep(1.5)
