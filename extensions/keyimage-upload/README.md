# KeyImage Upload Extension

OHIF extension for KeyImage upload with editor popup.

## Features

- Capture viewport image with annotations
- Edit image with text, arrows, and crop tools
- Upload to server for DICOM CR KeyImage conversion

## Usage

The extension adds a "KeyImage Upload" button to the toolbar. Click it to open the editor popup.

## Configuration

Set `window.config.keyimageUploadUrl` to configure the upload endpoint (default: `/api/keyimage/upload`).
