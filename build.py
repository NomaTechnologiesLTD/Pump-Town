#!/usr/bin/env python3
"""
build.py — Combines split JS files back into a single index.html for deployment.

Usage: python3 build.py
  
  Reads: src/index.html (core with DegensCity component)
         src/js/*.js    (extracted components)
  Outputs: dist/index.html (combined, ready for deployment)

This lets you EDIT files separately but DEPLOY as one file.
"""

import os
import glob

SRC_DIR = os.path.dirname(os.path.abspath(__file__))
JS_DIR = os.path.join(SRC_DIR, 'js')
DIST_DIR = os.path.join(SRC_DIR, 'dist')

os.makedirs(DIST_DIR, exist_ok=True)

# Read the core index.html
with open(os.path.join(SRC_DIR, 'index.html'), 'r') as f:
    core_html = f.read()

# Collect all JS files in load order (sound-system first, then alphabetical, misc last)
js_files = sorted(glob.glob(os.path.join(JS_DIR, '*.js')))

# Preferred load order
load_order = [
    'sound-system.js',
    'player-ui.js',
    'mayor.js', 
    'npc-social.js',
    'city-core.js',
    'economy.js',
    'casino-games.js',
    'social-chat.js',
    'achievements.js',
    'agents.js',
    'pages.js',
    'misc.js',
]

ordered_files = []
for name in load_order:
    path = os.path.join(JS_DIR, name)
    if os.path.exists(path):
        ordered_files.append(path)

# Add any files not in the explicit order
for f in js_files:
    if f not in ordered_files:
        ordered_files.append(f)

# Read all JS content
all_js = []
for filepath in ordered_files:
    filename = os.path.basename(filepath)
    with open(filepath, 'r') as f:
        content = f.read()
    # Re-indent to 8 spaces (matching original script block indentation)
    indented = '\n'.join('        ' + line if line.strip() else '' for line in content.split('\n'))
    all_js.append(f'\n        // ======== FROM {filename} ========')
    all_js.append(indented)

combined_js = '\n'.join(all_js)

# Insert before ReactDOM.render
marker = '        ReactDOM.render(<DegensCity />, document.getElementById(\'root\'));'
if marker not in core_html:
    print("ERROR: Could not find ReactDOM.render marker in index.html")
    exit(1)

output_html = core_html.replace(marker, combined_js + '\n\n' + marker)

# Write output
output_path = os.path.join(DIST_DIR, 'index.html')
with open(output_path, 'w') as f:
    f.write(output_html)

line_count = output_html.count('\n')
size_kb = len(output_html.encode()) // 1024

print(f"✅ Built dist/index.html")
print(f"   {line_count} lines, {size_kb}KB")
print(f"   Combined {len(ordered_files)} JS files")
print(f"   Files included: {', '.join(os.path.basename(f) for f in ordered_files)}")
