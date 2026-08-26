const { withGradleProperties } = require('@expo/config-plugins');

module.exports = function withAsyncStorageSize(config) {
  return withGradleProperties(config, (config) => {
    const propertyName = 'AsyncStorage_db_size_in_MB';
    
    // Si ya existe la propiedad, la actualizamos
    const existingIndex = config.modResults.findIndex(
      (prop) => prop.type === 'property' && prop.key === propertyName
    );

    if (existingIndex > -1) {
      config.modResults[existingIndex].value = '50';
    } else {
      config.modResults.push({
        type: 'property',
        key: propertyName,
        value: '50',
      });
    }

    return config;
  });
};
