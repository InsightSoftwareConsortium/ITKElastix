#!/usr/bin/env python3

import os
import sys

from voila.app import main

bundle_dir = getattr(sys, '_MEIPASS', os.path.abspath(os.path.dirname(__file__)))
path_to_notebook = os.path.abspath(os.path.join(bundle_dir, 'ITK_Registration_App.ipynb'))

argv = ['--Voila.tornado_settings', '{"websocket_max_message_size":838860800}',
        '--port=8867',
        '--theme=dark',
        path_to_notebook]

main(argv)
