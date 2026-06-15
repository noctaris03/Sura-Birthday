import os
import re

# 1. Get all images
images = []
for file in os.listdir('.'):
    if file.startswith('.') or file in ['background.png', 'ghibli_bg.png', 'sura-hero.jpg']:
        continue
    if file.lower().endswith(('.jpg', '.jpeg', '.png')):
        images.append(file)

# 2. Read index.html
with open('index.html', 'r') as f:
    content = f.read()

# 3. Remove <h3>Memories</h3>
content = re.sub(r'\s*<h3>Memories</h3>', '', content)

# 4. Generate the collage background HTML
bg_html = '<div class="background-container">\n    <div class="bg-collage-grid">\n'
for img in images:
    bg_html += f'        <img src="{img}" class="bg-collage-img">\n'
bg_html += '    </div>\n</div>'

# 5. Inject background HTML
pattern = r'<div class="background-container">.*?</div>'
content = re.sub(pattern, bg_html, content, flags=re.DOTALL)

# 6. Write back
with open('index.html', 'w') as f:
    f.write(content)

print("HTML updated!")
