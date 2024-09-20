module.exports = (req, res) => {
    const { search, retailStoreId } = req.query;
  
    const contentType = req.headers['content-type'];
    const authToken = req.headers['lognex-discount-api-auth-token'];
  
    const currentTime = new Date().toLocaleString();
    console.log(`[${currentTime}] Запрос на эндпоинт /counterparty с параметрами: search=${search}, retailStoreId=${retailStoreId}`);
  
    if (contentType !== 'application/json') {
      return res.status(400).json({ error: 'Неправильный Content-Type. Должен быть application/json' });
    }
  
    if (authToken !== '123') {
      return res.status(401).json({ error: 'Неверный токен авторизации' });
    }
  
    if (!search || !retailStoreId) {
      return res.status(400).json({ error: 'Отсутствуют необходимые параметры' });
    }
  
    res.status(200).json({
      message: `Получены данные контрагента по поиску: ${search}, для магазина с ID: ${retailStoreId}`,
    });
  };
  