import os
import re
import random

media_files = []
for file in os.listdir('.'):
    if file.startswith('.'): continue
    if file in ['background.png', 'ghibli_bg.png']: continue
    ext = file.lower().split('.')[-1]
    if ext in ['jpg', 'jpeg', 'png', 'mp4', 'mov']:
        media_files.append(file)

# Shuffle the list so videos and photos are mixed up
random.seed(42) # For a consistent beautiful mix
random.shuffle(media_files)

cards_html = ""
for file in media_files:
    ext = file.lower().split('.')[-1]
    
    # We do not use aspect-ratio anymore, the image/video dictates its height
    # so we can just leave the style attribute empty.
    aspect_style = ""
    
    if ext in ['mp4', 'mov']:
        cards_html += f"""
                <div class="memory-card">
                    <div class="card-inner">
                        <div class="media-container" {aspect_style}>
                            <video loop muted playsinline class="memory-video" data-autoplay>
                                <source src="{file}" type="video/mp4">
                                Your browser does not support the video tag.
                            </video>
                        </div>
                        <div class="caption">
                            <h3>Memories</h3>
                            <p>{file}</p>
                        </div>
                    </div>
                </div>"""
    else:
        cards_html += f"""
                <div class="memory-card">
                    <div class="card-inner">
                        <div class="media-container" {aspect_style}>
                            <img src="{file}" alt="Memory" class="memory-image">
                        </div>
                        <div class="caption">
                            <h3>Memories</h3>
                            <p>{file}</p>
                        </div>
                    </div>
                </div>"""

with open('index.html', 'r') as f:
    content = f.read()

pattern = r'(<div class="timeline">).*?(<footer class="footer-note">)'
replacement = r'\1\n' + cards_html + r'\n            </div>\n            \2'

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('index.html', 'w') as f:
    f.write(new_content)

print(f"Shuffled and added {len(media_files)} frames!")
