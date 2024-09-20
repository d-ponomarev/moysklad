const axios = require("axios");

const TOKEN = "e8d72cbb586832eb3715b04ce61e17cda8d65048";

module.exports = async (req, res) => {
  const { method, url } = req;

  const authToken = req.headers["lognex-discount-api-auth-token"];
  if (authToken !== "123") {
    return res.status(401).json({ error: "Неверный токен авторизации" });
  }

  if (url === "/counterparty" && method === "GET") {
    const { search, retailStoreId } = req.query;

    if (!search) {
      return res.status(400).json({ error: "Отсутствует параметр search" });
    }

    try {
      const counterpartyReponse = await axios.get(
        `https://api.moysklad.ru/api/remap/1.2/entity/counterparty/${search}`,
        {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      const counterparty = counterpartyReponse.data;

      if (counterparty.id) {
        res.status(200).json({
          rows: [
            {
              id: counterparty.id,
              name: counterparty.name,
              discountCardNumber: counterparty.discountCardNumber,
            },
          ],
        });
      } else {
        res.status(404).json({ error: "Контрагент не найден" });
      }
    } catch (error) {
      console.error("Ошибка при запросе к API МойСклад:", error);
      res.status(500).json({ error: "Ошибка при запросе к API МойСклад" });
    }
  } else if (url === "/counterparty/detail" && method === "POST") {
    const { meta } = req.body;

    try {
      const counterpartyReponse = await axios.get(
        `https://api.moysklad.ru/api/remap/1.2/entity/counterparty/${meta.id}`,
        {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      const counterparty = counterpartyReponse.data;

      if (counterparty.id) {
        let bonusField = null;
        if (
            counterparty.attributes &&
            counterparty.attributes.length > 0
        ) {
          bonusField = counterparty.attributes.find(
            (attr) => attr.name === "Бонусы"
          );
        }

        res.status(200).json({
          bonusProgram: {
            agentBonusBalance: bonusField.value,
          },
        });
      } else {
        res.status(404).json({ error: "Контрагент не найден" });
      }
    } catch (error) {
      console.error("Ошибка при запросе к API МойСклад:", error);
      res.status(500).json({ error: "Ошибка при запросе к API МойСклад"});
    }
  } else {
    res.status(404).json({ error: "Маршрут не найден" });
  }
};
