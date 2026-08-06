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

  // Por defecto (Granizados / App principal)
  return config;
};
