import sys, os
sys.path.append(os.path.dirname(__file__))
from download_commons import download_commons_image
import time

downloads = [
    ("File:ModCon boiler system.jpg", "pool_downloads/modcon_boiler_system.jpg"),
    ("File:Replacement of a central heating radiator, Hillegersberg, Rotterdam (2022) 01.jpg", "pool_downloads/radiator_replacement_01.jpg"),
    ("File:Replacement of a central heating radiator, Hillegersberg, Rotterdam (2022) 03.jpg", "pool_downloads/radiator_replacement_03.jpg"),
    ("File:Gas Pipe Installation In A Construction Site.jpg", "pool_downloads/gas_pipe_construction.jpg"),
    ("File:Stillson Pipe Wrench of Stephen and Elmer Braun.jpg", "pool_downloads/stillson_wrench.jpg"),
    ("File:Copper water pipes.jpg", "pool_downloads/copper_water_pipes_clean.jpg"),
    ("File:PEX installation tools and fittings.jpg", "pool_downloads/pex_tools_fittings.jpg"),
    ("File:Pipe clamp 1.jpg", "pool_downloads/pipe_clamp_steel.jpg")
]

for title, dest in downloads:
    download_commons_image(title, dest)
    time.sleep(1.5)
