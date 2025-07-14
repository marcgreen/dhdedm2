# PWA Icon Generation Guide

To complete your PWA setup, you'll need to generate icons in various sizes for different devices and platforms.

## Required Icon Sizes

Based on the manifest.json, you need these icons:

- `icon-72x72.png` - Small Android icon
- `icon-96x96.png` - Medium Android icon  
- `icon-128x128.png` - Large Android icon
- `icon-144x144.png` - Android high-DPI
- `icon-152x152.png` - iPad icon
- `icon-192x192.png` - Standard PWA icon
- `icon-384x384.png` - Large PWA icon
- `icon-512x512.png` - Splash screen icon

## Creating Icons

### Option 1: Using an Online Generator
1. Visit [PWA Icon Generator](https://www.pwabuilder.com/imageGenerator)
2. Upload your logo (ideally 512x512px)
3. Download the generated icon pack
4. Place icons in `static/icons/` directory

### Option 2: Using ImageMagick (Command Line)
```bash
# Install ImageMagick first, then:
convert logo.png -resize 72x72 static/icons/icon-72x72.png
convert logo.png -resize 96x96 static/icons/icon-96x96.png
convert logo.png -resize 128x128 static/icons/icon-128x128.png
convert logo.png -resize 144x144 static/icons/icon-144x144.png
convert logo.png -resize 152x152 static/icons/icon-152x152.png
convert logo.png -resize 192x192 static/icons/icon-192x192.png
convert logo.png -resize 384x384 static/icons/icon-384x384.png
convert logo.png -resize 512x512 static/icons/icon-512x512.png
```

### Option 3: Manual Creation
Create a simple D&D-themed icon for "Der Spielleiter":
- Background: Purple gradient (#7c3aed to #4c1d95)
- Symbol: Castle 🏰 or dice 🎲 or scroll 📜
- Text: "DS" for "Der Spielleiter"

## Directory Structure
```
static/
├── icons/
│   ├── icon-72x72.png
│   ├── icon-96x96.png
│   ├── icon-128x128.png
│   ├── icon-144x144.png
│   ├── icon-152x152.png
│   ├── icon-192x192.png
│   ├── icon-384x384.png
│   └── icon-512x512.png
├── screenshots/
│   ├── desktop.png (1280x720)
│   └── mobile.png (390x844)
├── manifest.json
├── sw.js
└── browserconfig.xml
```

## Additional Considerations

1. **Maskable Icons**: Make sure your icons work well when masked (Android adaptive icons)
2. **Screenshots**: Add app screenshots for the app stores
3. **Theme Colors**: Ensure colors match your app's design
4. **Favicon**: Don't forget smaller favicon sizes for browsers

## Testing Your Icons

After adding icons, test them:
1. Deploy your app
2. Open in Chrome DevTools > Application > Manifest
3. Check that all icons load correctly
4. Test the "Add to Home Screen" feature on mobile 