module.exports = (req, res) => {
    // Проверка заголовков
    const contentType = req.headers['content-type'];
    const authToken = req.headers['lognex-discount-api-auth-token'];
  
    if (authToken !== '123') {
      return res.status(401).json({ error: 'Неверный токен авторизации' });
    }
  
    // Получаем данные из тела запроса
    const { retailStore, meta, name, discountCardNumber, phone, email, legalFirstName, legalMiddleName, legalLastName, birthDate, sex } = req.body;
  
    // Логирование запроса
    console.log(`Получен POST-запрос на /counterparty/detail с данными:`);
    console.log(`Магазин: ${retailStore.name}`);
    console.log(`Контрагент: ${name}, телефон: ${phone}, email: ${email}`);
  
    // Ответ на запрос
    res.status(200).json({
      bonusProgram: {
        agentBonusBalance: 500 // Пример: баланс бонусов
      }
    });
  };
  