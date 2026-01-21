window.config = {
  routerBasename: '/',
  showStudyList: true,
  disableServiceWorker: true,
  extensions: [
    '@ohif/extension-default',
    '@ohif/extension-cornerstone',
    '@ohif/extension-cornerstone-dicom-sr',
  ],
  modes: [],
  // Settings to support all modalities, including SC
  experimental: {
    // Allow displaying all modalities, including SC (Secondary Capture)
    allowAllModalities: true,
  },
  dataSources: [{
    namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
    sourceName: 'dicomweb',
    configuration: {
      name: 'dcm4chee',
      qidoRoot: 'https://rrpl146.raddico.com/dcm4chee-arc/aets/DCM4CHEE/rs',
      wadoRoot: 'https://rrpl146.raddico.com/dcm4chee-arc/aets/DCM4CHEE/rs',
      stowRoot: 'https://rrpl146.raddico.com/dcm4chee-arc/aets/DCM4CHEE/rs',
      wadoUriRoot: 'https://rrpl146.raddico.com/dcm4chee-arc/aets/DCM4CHEE/wado',
      qidoSupportsIncludeField: true,
      singlepart: 'auto',

      qidoConfig: {
        url: 'https://rrpl146.raddico.com/dcm4chee-arc/aets/DCM4CHEE/rs',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      },

      // Configuration to support SC (Secondary Capture) series
      sopClassHandlerExtensions: {
        '1.2.840.10008.5.1.4.1.1.7': '@ohif/extension-default.sopClassHandlerModule.stack', // Secondary Capture Image Storage
      },
      // Explicitly specify that SC modality should be processed
      supportedSOPClassUIDs: [
        '1.2.840.10008.5.1.4.1.1.7', // Secondary Capture Image Storage
      ],
      // List of supported modalities - include SC
      supportedModalities: ['CT', 'MR', 'PT', 'CR', 'DX', 'MG', 'US', 'SC'],
      // Or disable modality filtering completely
      // excludeModalities: [], // Empty list = don't exclude anything
    },
  }],
  defaultDataSourceName: 'dicomweb',
  // URL for sending keyimage (PNG will be converted to DICOM CR on server)
  keyimageUploadUrl: 'https://rrpl146.raddico.com/api/keyimage/upload',
};
