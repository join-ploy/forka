#!/bin/bash
# Generate app icons from the source chain SVG.
# The source SVG is JUST the chain icon (no background). This script composites
# it onto a charcoal rounded-squircle with a drop shadow on a transparent canvas,
# suitable for macOS/Windows app icons.
#
# Requires: brew install librsvg imagemagick
# Optional: Xcode (for macOS Tahoe Assets.car via actool)
# Produces:
#   resources/build/icon.png   (1024x1024)
#   resources/build/icon.icns  (macOS, legacy)
#   resources/build/Assets.car (macOS Tahoe+, if Xcode available)
#   resources/build/icon.ico   (Windows, multi-size)
#   resources/icon.png         (256x256, tray/dev)
#   resources/icon-dev.png     (256x256 with "DEV" banner)
#   resources/logo.svg         (standalone chain icon copy)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
SVG_SOURCE="$SCRIPT_DIR/icon.icon/Assets/logo.svg"
BUILD_DIR="$PROJECT_DIR/resources/build"
RESOURCES_DIR="$PROJECT_DIR/resources"
TMP_DIR=$(mktemp -d)

trap 'rm -rf "$TMP_DIR"' EXIT

if [ ! -f "$SVG_SOURCE" ]; then
  echo "Error: source SVG not found at $SVG_SOURCE" >&2
  exit 1
fi

missing=()
command -v rsvg-convert &>/dev/null || missing+=(librsvg)
command -v magick &>/dev/null       || missing+=(imagemagick)
if [ ${#missing[@]} -gt 0 ]; then
  echo "Error: missing dependencies: ${missing[*]}" >&2
  echo "Install with: brew install ${missing[*]}" >&2
  exit 1
fi

echo "Generating icons from $SVG_SOURCE..."

# --- Step 1: Render the chain icon to a transparent PNG, sized to fit
#     inside the squircle with comfortable padding (~55% of canvas).
rsvg-convert -w 560 -h 560 "$SVG_SOURCE" -o "$TMP_DIR/chain.png"

# --- Step 2: Build the rounded squircle on a transparent canvas.
#     The squircle is 824x824 with 164px radius, centered in 1024x1024.
#     A subtle radial gradient fill gives it depth.

# Create the squircle mask (white rounded rect on black)
magick -size 824x824 xc:black \
  -fill white -draw "roundrectangle 0,0,823,823,164,164" \
  "$TMP_DIR/mask.png"

# Create the squircle fill with radial gradient (lighter center, darker edges)
magick -size 824x824 radial-gradient:"#2E3034-#1C1D1F" "$TMP_DIR/fill.png"

# Apply mask to fill
magick "$TMP_DIR/fill.png" "$TMP_DIR/mask.png" \
  -alpha off -compose CopyOpacity -composite \
  "$TMP_DIR/squircle-raw.png"

# Center on 1024x1024 canvas with drop shadow
magick -size 1024x1024 xc:none \
  "$TMP_DIR/squircle-raw.png" -gravity center -geometry +0-6 -composite \
  \( "$TMP_DIR/squircle-raw.png" -gravity center -background none -shadow 50x12+0+10 \) \
  -gravity center -compose DstOver -composite \
  "$TMP_DIR/base.png"

# --- Step 3: Composite chain icon onto the squircle
magick "$TMP_DIR/base.png" \
  "$TMP_DIR/chain.png" -gravity center -composite \
  "$BUILD_DIR/icon.png"
echo "  -> resources/build/icon.png (1024x1024)"

# --- Step 4: 256px tray/dev icon
magick "$BUILD_DIR/icon.png" -resize 256x256 "$RESOURCES_DIR/icon.png"
echo "  -> resources/icon.png (256x256)"

# --- Step 5: Dev icon with "DEV" banner
BOLD_FONT="/System/Library/Fonts/Helvetica.ttc"
if [ ! -f "$BOLD_FONT" ]; then
  BOLD_FONT="$(fc-list :bold -f '%{file}\n' 2>/dev/null | head -1)"
fi
magick "$RESOURCES_DIR/icon.png" \
  -gravity South \
  -font "$BOLD_FONT" -fill "#E53E3E" -pointsize 48 \
  -stroke black -strokewidth 3 -annotate +0+24 "DEV" \
  -stroke none -fill white -annotate +0+24 "DEV" \
  "$RESOURCES_DIR/icon-dev.png"
echo "  -> resources/icon-dev.png (256x256 with DEV banner)"

# --- Step 6: macOS .icns via iconutil (produces all required sizes)
ICONSET_DIR="$TMP_DIR/app.iconset"
mkdir -p "$ICONSET_DIR"
for size in 16 32 128 256 512; do
  magick "$BUILD_DIR/icon.png" -resize "${size}x${size}" "$ICONSET_DIR/icon_${size}x${size}.png"
  double=$((size * 2))
  magick "$BUILD_DIR/icon.png" -resize "${double}x${double}" "$ICONSET_DIR/icon_${size}x${size}@2x.png"
done
iconutil --convert icns --output "$BUILD_DIR/icon.icns" "$ICONSET_DIR"
echo "  -> resources/build/icon.icns"

# --- Step 7: Windows .ico (multi-size)
magick "$BUILD_DIR/icon.png" -define icon:auto-resize=256,128,64,48,32,16 "$BUILD_DIR/icon.ico"
echo "  -> resources/build/icon.ico"

# --- Step 8: macOS Tahoe Assets.car (requires Xcode for actool)
ICON_SOURCE="$SCRIPT_DIR/icon.icon"
if xcrun actool --version &>/dev/null && [ -d "$ICON_SOURCE" ]; then
  PLIST_TMP="$TMP_DIR/assetcatalog_generated_info.plist"
  xcrun actool "$ICON_SOURCE" --compile "$BUILD_DIR" \
    --output-format human-readable-text --notices --warnings --errors \
    --output-partial-info-plist "$PLIST_TMP" \
    --app-icon icon --include-all-app-icons \
    --enable-on-demand-resources NO \
    --development-region en \
    --target-device mac \
    --minimum-deployment-target 26.0 \
    --platform macosx
  rm -f "$PLIST_TMP"
  echo "  -> resources/build/Assets.car (macOS Tahoe)"
else
  echo "  -- skipping Assets.car (Xcode not available)"
fi

# --- Step 9: Copy source SVG to top-level resources
cp "$SVG_SOURCE" "$RESOURCES_DIR/logo.svg"
echo "  -> resources/logo.svg"

echo "Done!"
