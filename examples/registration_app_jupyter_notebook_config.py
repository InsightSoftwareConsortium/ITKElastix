# Configuration file for jupyter-notebook.

## Supply overrides for the tornado.web.Application that the Jupyter notebook uses.
c.NotebookApp.tornado_settings = {"websocket_max_message_size": 800 * 1024 * 1024} # 800 MB
