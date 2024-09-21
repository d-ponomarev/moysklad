const express = require("express");
const axios = require("axios");
const app = express();

const TOKEN = "e8d72cbb586832eb3715b04ce61e17cda8d65048";

app.use(express.json());

const verifyAuthToken = (req, res, next) => {
  if (req.path === "/retaildemand/create") {
    return next();
  }

  const authToken = req.headers["lognex-discount-api-auth-token"];
  if (authToken !== "123") {
    return res.status(401).json({ error: "Неверный токен авторизации" });
  }
  next();
};

app.use(verifyAuthToken);

app.get("/counterparty", async (req, res) => {
  const { search } = req.query;

  if (!search) {
    return res.status(400).json({ error: "Отсутствует параметр search" });
  }

  try {
    const response = await axios.get(
      `https://api.moysklad.ru/api/remap/1.2/entity/counterparty/${search}`,
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const counterparty = response.data;

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
});

app.post("/counterparty/detail", async (req, res) => {
  const { meta } = req.body;

  try {
    const response = await axios.get(
      `https://api.moysklad.ru/api/remap/1.2/entity/counterparty/${meta.id}`,
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const counterparty = response.data;

    if (counterparty.id) {
      let bonusField = null;
      if (counterparty.attributes && counterparty.attributes.length > 0) {
        bonusField = counterparty.attributes.find(
          (attr) => attr.name === "Бонусы"
        );
      }

      res.status(200).json({
        bonusProgram: {
          agentBonusBalance: bonusField ? bonusField.value : 0,
        },
      });
    } else {
      res.status(404).json({ error: "Контрагент не найден" });
    }
  } catch (error) {
    console.error("Ошибка при запросе к API МойСклад:", error);
    res.status(500).json({ error: "Ошибка при запросе к API МойСклад" });
  }
});

app.post("/retaildemand/recalc", async (req, res) => {
  const { meta } = req.body;

  try {
    const response = await axios.get(
      `https://api.moysklad.ru/api/remap/1.2/entity/counterparty/${meta.agent.meta.id}`,
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const counterparty = response.data;

    if (counterparty.id) {
      let bonusField = null;
      if (counterparty.attributes && counterparty.attributes.length > 0) {
        bonusField = counterparty.attributes.find(
          (attr) => attr.name === "Бонусы"
        );
      }

      res.status(200).json({
        bonusProgram: {
          agentBonusBalance: bonusField ? bonusField.value : 0,
        },
      });
    } else {
      res.status(404).json({ error: "Контрагент не найден" });
    }
  } catch (error) {
    console.error("Ошибка при запросе к API МойСклад:", error);
    res.status(500).json({ error: "Ошибка при запросе к API МойСклад" });
  }
});

app.post("/retaildemand/create", async (req, res) => {
  const { body } = req;

  if (
    !body.events ||
    !body.events[0] ||
    !body.events[0].meta ||
    !body.events[0].meta.href
  ) {
    return;
  }

  try {
    const orderUrl = body.events[0].meta.href;
    const orderResponse = await axios.get(orderUrl, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Accept-Encoding": "gzip",
        "Content-Type": "application/json",
      },
    });

    const orderData = orderResponse.data;

    const counterpartyUrl = orderData.agent.meta.href;
    const counterpartyResponse = await axios.get(counterpartyUrl, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Accept-Encoding": "gzip",
        "Content-Type": "application/json",
      },
    });

    const counterpartyData = counterpartyResponse.data;
    let tags = counterpartyData.tags || [];

    const salesAmount = counterpartyData.salesAmount;

    let updatedTags = [...tags.map((tag) => tag.name)];
    let groupChanged = false;

    if (
      salesAmount >= 100 &&
      salesAmount < 1000000 &&
      !updatedTags.includes("silver")
    ) {
      updatedTags.push("silver");
      groupChanged = true;
    } else if (salesAmount >= 1000000 && salesAmount < 3000000) {
      if (!updatedTags.includes("gold")) {
        updatedTags.push("gold");
        updatedTags = updatedTags.filter((tag) => tag !== "silver");
        groupChanged = true;
      }
    } else if (salesAmount >= 3000000 && !updatedTags.includes("platinum")) {
      updatedTags.push("platinum");
      updatedTags = updatedTags.filter((tag) => tag !== "gold");
      groupChanged = true;
    }

    if (groupChanged) {
      const updateUrl = counterpartyUrl;

      const payload = {
        tags: updatedTags.map((tag) => ({ name: tag })),
      };

      console.log("Отправляем PUT-запрос на URL:", updateUrl);
      console.log("Отправляемые данные:", JSON.stringify(payload, null, 2));

      const counterpartyEditResponse = await axios.put(
        updateUrl,
        payload,
        {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Accept-Encoding": "gzip",
            "Content-Type": "application/json",
          },
        }
      );

      console.log("Ответ от PUT-запроса:", JSON.stringify(counterpartyEditResponse.data, null, 2));
      
      res.status(200).json({
        message: "Теги обновлены",
        updatedTags,
        counterpartyEditResponse: counterpartyEditResponse.data
      });
    } else {
      res.status(200).json({ message: "Группы не изменены", updatedTags });
    }
  } catch (error) {
    console.error("Ошибка при запросе к API МойСклад:", error);
    res.status(500).json({ error: "Ошибка при запросе к API МойСклад" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
