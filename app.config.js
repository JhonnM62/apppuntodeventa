module.exports = ({ config }) => {
  if (process.env.APP_VARIANT === 'restaurante') {
    return {
      ...config,
      name: "Q Hubo Mor Restaurante",
      android: {
        ...config.android,
        package: "com.anonymous.restaurante"
      }
    };
  }
  if (process.env.APP_VARIANT === 'fogata') {
    return {
      ...config,
      name: "Fogata POS",
      android: {
        ...config.android,
        package: "com.anonymous.fogata"
      }
    };
  }

  // Por defecto (Granizados / App principal)
  return config;
};
