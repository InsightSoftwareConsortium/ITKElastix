import os

# The napari notebook needs a display with OpenGL, which pytest-xvfb provides
# through Xvfb. Qt's default xcb platform plugin additionally needs X11
# libraries that the CI runners lack, and without them the notebook kernel
# dies. The offscreen platform runs every cell, although the 3D canvas stays
# blank in the screenshots it takes.
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
