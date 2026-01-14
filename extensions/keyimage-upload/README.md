# KeyImage Upload Extension

OHIF extension for KeyImage upload with editor popup.

## Features

- Capture viewport image with annotations
- Edit image with text, arrows, and crop tools
- Upload to server for DICOM CR KeyImage conversion
- Loading indicator during upload
- Success/Error notifications

## Usage

1. Click "KeyImage Upload" button in the toolbar to open the editor popup
2. Use annotation tools (Text, Arrow) to mark up the image
3. (Optional) Use Crop tool to select specific area to save
4. Click "Сохранить KeyImage" to upload to server
5. Wait for upload to complete (loading indicator shown)
6. View success notification with SOP Instance UID

## Tools Available

- **Text** - Add text annotations
- **Arrow** - Add arrow annotations
- **Zoom** - Zoom in/out
- **Pan** - Pan the image
- **W/L** - Adjust window/level
- **Crop** - Select area to crop (optional)

## Configuration

Set `window.config.keyimageUploadUrl` in your config file:

```javascript
window.config = {
  // ... other config
  keyimageUploadUrl: 'https://your-server.com/api/keyimage/upload',
};
```

## API Requirements

The server endpoint must accept `multipart/form-data` POST requests with:

- `image` (file, required) - PNG file with image and annotations
- `study_iuid` (string, required) - Study Instance UID
- `series_iuid` (string, optional) - Series Instance UID
- `sop_iuid` (string, optional) - SOP Instance UID

Expected response format:

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

## Implementation Details

- **Custom Crop tool** - independent canvas overlay implementation:
  - Dashed blue line (matching primary button color: `rgb(94, 129, 244)`)
  - Dark overlay outside crop area for better visibility
  - Blue corner handles for visual feedback
  - No text labels or measurements
  - Completely independent from Cornerstone annotations
  - Automatically cleared after successful save
  - Automatically cleared when popup closes
- PNG export includes all Cornerstone annotations (Text, Arrow)
- Crop area is applied during PNG generation (not as annotation)
- Viewport settings (zoom, pan, window/level) are synchronized with main viewer
