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
  const counterpartyData = req.body;

  try {
    const response = await axios.get(
      `https://api.moysklad.ru/api/remap/1.2/entity/counterparty/${counterpartyData.meta.id}`,
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
        bonusField = counterparty.attributes.find((attr) => attr.name === "Бонусы");
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

// app.post("/retaildemand/create", async (req, res) => {
//   const { body } = req;

//   if (
//     !body.events ||
//     !body.events[0] ||
//     !body.events[0].meta ||
//     !body.events[0].meta.href
//   ) {
//     return;
//   }

//   try {
//     const orderUrl = body.events[0].meta.href;
//     const orderResponse = await axios.get(orderUrl, {
//       headers: {
//         Authorization: `Bearer ${TOKEN}`,
//         "Accept-Encoding": "gzip",
//         "Content-Type": "application/json",
//       },
//     });

//     const orderData = orderResponse.data;

//     const counterpartyUrl = orderData.agent.meta.href;
//     const counterpartyResponse = await axios.get(counterpartyUrl, {
//       headers: {
//         Authorization: `Bearer ${TOKEN}`,
//         "Accept-Encoding": "gzip",
//         "Content-Type": "application/json",
//       },
//     });

//     const counterpartyData = counterpartyResponse.data;
//     let tags = counterpartyData.tags || [];

//     const salesAmount = counterpartyData.salesAmount;

//     let updatedTags = [...tags.map((tag) => tag)];
//     let groupChanged = false;

//     if (
//       salesAmount >= 100 &&
//       salesAmount < 1000000 &&
//       !updatedTags.includes("silver")
//     ) {
//       updatedTags.push("silver");
//       groupChanged = true;
//     } else if (salesAmount >= 1000000 && salesAmount < 3000000) {
//       if (!updatedTags.includes("gold")) {
//         updatedTags.push("gold");
//         updatedTags = updatedTags.filter((tag) => tag !== "silver");
//         groupChanged = true;
//       }
//     } else if (salesAmount >= 3000000 && !updatedTags.includes("platinum")) {
//       updatedTags.push("platinum");
//       updatedTags = updatedTags.filter((tag) => tag !== "gold");
//       groupChanged = true;
//     }

//     if (groupChanged) {
//       const counterpartyEditResponse = await axios.put(
//         counterpartyUrl,
//         {
//           tags: updatedTags,
//         },
//         {
//           headers: {
//             Authorization: `Bearer ${TOKEN}`,
//             "Accept-Encoding": "gzip",
//             "Content-Type": "application/json",
//           },
//         }
//       );
//       console.log(`Теги обновлены: ${updatedTags}`);
//     }

//     res.status(200).json({ message: "Теги обновлены", updatedTags });
//   } catch (error) {
//     console.error("Ошибка при запросе к API МойСклад:", error);
//     res.status(500).json({ error: "Ошибка при запросе к API МойСклад" });
//   }
// });

app.post("/retaildemand/recalc", async (req, res) => {
  console.log(JSON.stringify(req.body, null, 2));

  const { positions, agent, bonusProgram, preferredBonusToSpend } = req.body;

  try {
    const response = await axios.get(
      `https://api.moysklad.ru/api/remap/1.2/entity/counterparty/${agent.meta.id}`,
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const counterparty = response.data;

    if (!counterparty.id) {
      return res.status(404).json({ error: "Контрагент не найден" });
    }

    let bonusField = null;
    if (counterparty.attributes && counterparty.attributes.length > 0) {
      bonusField = counterparty.attributes.find((attr) => attr.name === "Бонусы");
    }

    const bonusBalance = bonusField ? bonusField.value : 0;
    const tags = counterparty.tags || [];

    let earnPercent = 0;
    let maxBonusSpendPercent = 0;

    if (tags.includes("silver")) {
      earnPercent = 5;
      maxBonusSpendPercent = 30;
    } else if (tags.includes("platinum")) {
      earnPercent = 15;
      maxBonusSpendPercent = 50;
    } else if (tags.includes("gold")) {
      earnPercent = 10;
      maxBonusSpendPercent = 30;
    } else if (tags.includes("партнер")) {
      earnPercent = 20;
      maxBonusSpendPercent = 50;
    }

    let totalSum = 0;
    positions.forEach(position => {
      totalSum += position.quantity * position.price;
    });

    if (bonusProgram.transactionType === "EARNING") {
      const bonusValueToEarn = Math.round((totalSum * earnPercent) / 100);
      const maxBonusSpend = Math.round((totalSum * maxBonusSpendPercent) / 100);
      const bonusValueToSpend = Math.min(bonusBalance, maxBonusSpend);

      const updatedPositions = positions.map((position) => {
        return {
          assortment: position.assortment,
          quantity: position.quantity,
          price: position.price,
          discountPercent: 0,
          discountedPrice: position.price
        };
      });

      const result = {
        agent: {
          meta: {
            href: agent.meta.href,
            id: agent.meta.id
          },
          name: agent.name,
          discountCardNumber: agent.discountCardNumber,
          phone: agent.phone,
          email: agent.email,
          legalFirstName: agent.legalFirstName,
          legalMiddleName: agent.legalMiddleName,
          legalLastName: agent.legalLastName,
          sex: agent.sex,
          birthDate: agent.birthDate
        },
        positions: updatedPositions,
        bonusProgram: {
          transactionType: "EARNING",
          agentBonusBalance: bonusBalance,
          bonusValueToSpend: bonusValueToSpend,
          bonusValueToEarn: bonusValueToEarn,
          agentBonusBalanceAfter: Math.round(bonusBalance + bonusValueToEarn),
          paidByBonusPoints: 0
        },
        needVerification: false
      };

      console.log(JSON.stringify(result, null, 2));
      return res.status(200).json(result);
    }

    const maxBonusSpend = Math.round((totalSum * maxBonusSpendPercent) / 100);
    const bonusValueToSpend = Math.min(bonusBalance, maxBonusSpend);
    
    const remainingSum = totalSum - bonusValueToSpend;
    const bonusValueToEarn = Math.round((remainingSum * earnPercent) / 100);

    const updatedPositions = positions.map((position) => {
      const discountPercent = (bonusValueToSpend / totalSum) * 100;
      const discountedPrice = position.price - (position.price * discountPercent) / 100;
      return {
        assortment: position.assortment,
        quantity: position.quantity,
        price: position.price,
        discountPercent: discountPercent.toFixed(2),
        discountedPrice: discountedPrice.toFixed(2)
      };
    });

    const result = {
      agent: {
        meta: {
          href: agent.meta.href,
          id: agent.meta.id
        },
        name: agent.name,
        discountCardNumber: agent.discountCardNumber,
        phone: agent.phone,
        email: agent.email,
        legalFirstName: agent.legalFirstName,
        legalMiddleName: agent.legalMiddleName,
        legalLastName: agent.legalLastName,
        sex: agent.sex,
        birthDate: agent.birthDate
      },
      positions: updatedPositions,
      bonusProgram: {
        transactionType: "SPENDING",
        agentBonusBalance: bonusBalance,
        bonusValueToSpend: bonusValueToSpend,
        bonusValueToEarn: bonusValueToEarn,
        agentBonusBalanceAfter: (bonusBalance - bonusValueToSpend + bonusValueToEarn),
        paidByBonusPoints: bonusValueToSpend
      },
      needVerification: false
    };

    console.log(JSON.stringify(result, null, 2));
    res.status(200).json(result);

  } catch (error) {
    console.error("Ошибка при запросе к API МойСклад:", error);
    res.status(500).json({ error: "Ошибка при запросе к API МойСклад" });
  }
});

app.post("/retaildemand", async (req, res) => {
  console.log(JSON.stringify(req.body, null, 2));
  const retaildemand = req.body;

  try {
    const response = await axios.get(
      `https://api.moysklad.ru/api/remap/1.2/entity/counterparty/${retaildemand.agent.meta.id}`,
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const counterparty = response.data;

    let tags = counterparty.tags;
    const salesAmount = counterparty.salesAmount / 100;
    
    let updatedTags = [...tags.map((tag) => tag)];

    let bonusField = null;
    if (counterparty.attributes && counterparty.attributes.length > 0) {
      bonusField = counterparty.attributes.find((attr) => attr.name === "Бонусы");
      bonusField.value = bonusField.value - retaildemand.bonusProgram.bonusValueToSpend + retaildemand.bonusProgram.bonusValueToEarn;
    }

    let groupChanged = false;

    if (salesAmount >= 1 && salesAmount <= 9999 && !updatedTags.includes("silver")) {
      updatedTags.push("silver");
      groupChanged = true;
    } else if (salesAmount >= 10000 && salesAmount <= 29999 && !updatedTags.includes("gold")) {
      updatedTags.push("gold");
      updatedTags = updatedTags.filter((tag) => tag !== "silver");
      groupChanged = true;
    } else if (salesAmount >= 30000 && !updatedTags.includes("platinum")) {
      updatedTags.push("platinum");
      updatedTags = updatedTags.filter((tag) => tag !== "gold");
      groupChanged = true;
    }

    if (groupChanged) {
      const response = await axios.put(
        `https://api.moysklad.ru/api/remap/1.2/entity/counterparty/${retaildemand.agent.meta.id}`,
        {
          tags: updatedTags,
          attributes: [bonusField]
        },
        {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(response);
    }

    console.log(updatedTags);
    console.log(bonusField.value);

    res.status(201);
    
  } catch (error) {
    console.error("Ошибка при запросе к API МойСклад:", error);
    res.status(500).json({ error: "Ошибка при запросе к API МойСклад" });
  }


  res.status(201).json({ message: "Success" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
