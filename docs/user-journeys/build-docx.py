# Build a journey guide .docx with pandoc. Usage: python3 build-docx.py SRC.md OUT.docx TITLE SUBTITLE LANG
# Image heights: 14.1 cm per 844 px (one phone screen), capped at 20 cm; desktop-wide images span the page.
import re, subprocess, sys
from PIL import Image
src, out, title, subtitle, lang = sys.argv[1:6]
md = open(src).read().split('\n', 1)[1]          # drop the H1; the title comes from metadata
def size(m):
    alt, path = m.group(1), m.group(2)
    w, h = Image.open(path).size
    cm = min(20.0, h * 14.1 / 844) if w < 800 else None
    attr = f'{{height={cm:.2f}cm}}' if cm else '{width=100%}'
    return f'![{alt}]({path}){attr}'
md = re.sub(r'!\[([^\]]*)\]\(([^)]+\.png)\)', size, md)
subprocess.run(['pandoc', '-f', 'markdown', '-o', out, '--metadata', f'title={title}',
                '--metadata', f'subtitle={subtitle}', '--metadata', f'lang={lang}'],
               input=md, text=True, check=True)
