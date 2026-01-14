# Testing KeyImage Save Functionality

## Functional Changes

Added complete KeyImage save functionality with support for:

1. **Crop tool** - area selection for saving
2. **PNG conversion** - with annotations and cropping
3. **Server upload** - multipart/form-data POST request
4. **UI indicators** - loading spinner and notifications
5. **Auto-cleanup** - crop annotation removal after save

## How to Test

### 1. Start Application

```bash
cd /Users/denydenyden/Projects/008.ohif
yarn run dev
```

Open http://localhost:3000

### 2. Open KeyImage Popup

1. Load a DICOM image
2. Click "KeyImage Upload" button in toolbar
3. Popup editor opens (90% screen)

### 3. Test Tools

#### Annotations
- **Text** - add text annotation
- **Arrow** - add arrow annotation

#### Navigation
- **Zoom** - zoom in/out
- **Pan** - pan the image
- **W/L** - adjust window/level

#### Crop (new!)
- **Crop** - draw a rectangle around the area
- Hint should appear: "💡 Draw a rectangle on the image..."
- Only the last rectangle will be used for crop

### 4. Saving

Click "Save KeyImage" button:

**Expected behavior:**
- Button changes to "Saving..." with spinner
- Fullscreen overlay appears with loading indicator
- After successful upload:
  - Notification shows with SOP Instance UID
  - Crop annotation is automatically removed
  - Loading overlay disappears
- On error:
  - Error notification shows with details
  - Loading overlay disappears

### 5. Check Result

#### Without Crop
- Full image is saved
- All annotations included (Text, Arrow)
- RectangleROI NOT included in export

#### With Crop
- Only selected area is saved
- Annotations within crop area are included
- Image cropped to rectangle boundaries

### 6. Check Request

Open DevTools → Network → find POST request to `/api/keyimage/upload`

**Should contain:**
- `image` - PNG file
- `study_iuid` - Study Instance UID
- `series_iuid` - Series Instance UID (if available)
- `sop_iuid` - SOP Instance UID (if available)

**Example successful response:**
```json
{
  "status": "success",
  "message": "KeyImage successfully created and uploaded to archive",
  "sop_instance_uid": "1.2.826.0.1.3680043.2.1125.XXXX...",
  "series_instance_uid": "1.2.826.0.1.3680043.2.1125.YYYY...",
  "study_instance_uid": "1.2.840.113619.2.55.3.1234567890",
  "stow_response": 201
}
```

## Server Configuration

Make sure the correct URL is set in `platform/app/public/config/default.js`:

```javascript
window.config = {
  // ...
  keyimageUploadUrl: 'https://rrpl146.raddico.com/api/keyimage/upload',
};
```

## Known Features

1. **Crop annotation** - visible only until save, automatically removed after
2. **RectangleROI** - used as Crop tool, not displayed in export
3. **Study UID required** - save impossible without it
4. **Notifications** - success shown 5 sec, error 8 sec

## Troubleshooting

### Error: "Study Instance UID is required"
- Check that DICOM image is loaded correctly
- Metadata should contain Study Instance UID

### Upload error to server
- Check `keyimageUploadUrl` in config
- Check server availability (CORS)
- Check logs in DevTools Console

### Crop not working
- Make sure RectangleROI tool is active (Crop button)
- Draw a rectangle on the image
- Only the last rectangle is used

### Loading indicator stuck
- Check Network in DevTools - request may be hanging
- Reload the page

## Files Changed

- `extensions/keyimage-upload/src/components/KeyImageEditorPopup.tsx` (+200 lines)
- `extensions/keyimage-upload/README.md` (updated documentation)
- `.cursorrules` (added information about new changes)
