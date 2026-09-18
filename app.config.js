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
      icon: "./assets/icon-fogata.png",
      splash: {
        ...config.splash,
        image: "./assets/splash-icon-fogata.png"
      },
      web: {
        ...config.web,
        favicon: "./assets/favicon-fogata.png"
      },
      android: {
        ...config.android,
        package: "com.anonymous.fogata",
        adaptiveIcon: {
          foregroundImage: "./assets/adaptive-icon-fogata.png",
          backgroundColor: "#ffffff"
        }
      }
    };
  }

  // Por defecto (Granizados / App principal)
  return config;
};
