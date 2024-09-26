const express = require("express");
const axios = require("axios");
const app = express();

const TOKEN = "222e2994683792780a453d7b9a5d929b6a0d7b40";

app.use(express.json());

const verifyAuthToken = (req, res, next) => {
  const authToken = req.headers["lognex-discount-api-auth-token"];
  if (authToken !== "2Ky3H8B6xeo5") {
    return res.status(401).json({ error: "Неверный токен авторизации" });
  }
  next();
};

app.use(verifyAuthToken);

app.get("/roman/counterparty", async (req, res) => {
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

    if (counterparty && counterparty.id) {
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

app.post("/roman/counterparty/detail", async (req, res) => {
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

    if (counterparty && counterparty.id) {
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

app.post("/roman/retaildemand/recalc", async (req, res) => {
  console.log(JSON.stringify(req.body, null, 2));

  const { positions, agent, bonusProgram, preferredBonusToSpend } = req.body;

  try {
    const response = await axios.get(
      `https://api.moysklad.ru/api/remap/1.2/entity/counterparty/${agent.meta.id}`, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const counterparty = response.data;

    if (!counterparty || !counterparty.id) {
      return res.status(404).json({ error: "Контрагент не найден" });
    }

    let bonusField = null;
    if (counterparty.attributes && counterparty.attributes.length > 0) {
      bonusField = counterparty.attributes.find((attr) => attr.name === "Бонусы");
    }

    const bonusBalance = bonusField ? bonusField.value : 0;
    const tags = counterparty.tags || [];

    let earnPercent = 5;
    let maxBonusSpendPercent = 30;
    let discount = 0;

    if (tags.includes("сотрудник")) {
      discount = 20;
    } else if (tags.includes("партнер")) {
      earnPercent = 20;
      maxBonusSpendPercent = 50;
    } else if (tags.includes("silver")) {
      earnPercent = 5;
      maxBonusSpendPercent = 30;
    } else if (tags.includes("gold")) {
      earnPercent = 10;
      maxBonusSpendPercent = 30;
    } else if (tags.includes("platinum")) {
      earnPercent = 15;
      maxBonusSpendPercent = 50;
    }

    const productDetails = await Promise.all(positions.map(async (position) => {
      const productResponse = await axios.get(`https://api.moysklad.ru/api/remap/1.2/entity/product/${position.assortment.meta.id}`, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      });

      const attributes = productResponse.data.attributes || [];

      const restrictCashbackField = attributes.find((attr) => attr.name === "Ограничить кеш-бек");
      const restrictCashback = restrictCashbackField ? restrictCashbackField.value : false;

      const fixedCashbackField = attributes.find((attr) => attr.name === "Фиксированный кеш-бек");
      const fixedCashback = fixedCashbackField ? fixedCashbackField.value : null;
      
      return { 
        ...position,
        productDetails: productResponse.data,
        restrictCashback,
        fixedCashback
      };
    }));

    let totalSum = 0;
    productDetails.forEach(position => {
      totalSum += position.quantity * position.price;
    });

    const isLimitedCategory = (pathName) => {
      return pathName === "Кондитерка" || pathName === "Напитки";
    };

    if (bonusProgram.transactionType === "EARNING") {
      const updatedPositions = productDetails.map((position) => {
        const productPathName = position.productDetails.pathName || "";

        if (position.restrictCashback) {
          return {
            assortment: position.assortment,
            quantity: position.quantity,
            price: position.price.toFixed(2),
            discountPercent: discount ? discount.toFixed(2) : 0,
            discountedPrice: position.price.toFixed(2),
            bonusValueToEarn: 0
          };
        }

        if (position.fixedCashback !== null) {
          const bonusValueToEarn = Math.round((position.price * position.quantity * position.fixedCashback) / 100);
          const discountedPrice = discount ? position.price - (position.price * discount / 100) : position.price;

          return {
            assortment: position.assortment,
            quantity: position.quantity,
            price: position.price.toFixed(2),
            discountPercent: discount ? discount.toFixed(2) : 0,
            discountedPrice: discountedPrice.toFixed(2),
            bonusValueToEarn
          };
        }

        const limitedEarnPercent = isLimitedCategory(productPathName) ? 5 : earnPercent;
        const bonusValueToEarn = Math.round((position.price * position.quantity * limitedEarnPercent) / 100);
        const discountedPrice = discount ? position.price - (position.price * discount / 100) : position.price;

        return {
          assortment: position.assortment,
          quantity: position.quantity,
          price: position.price.toFixed(2),
          discountPercent: discount ? discount.toFixed(2) : 0,
          discountedPrice: discountedPrice.toFixed(2),
          bonusValueToEarn
        };
      });

      const totalBonusToEarn = updatedPositions.reduce((sum, pos) => sum + pos.bonusValueToEarn, 0);

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
        positions: updatedPositions.map(({ bonusValueToEarn, ...rest }) => rest),
        bonusProgram: {
          transactionType: "EARNING",
          agentBonusBalance: bonusBalance,
          bonusValueToEarn: totalBonusToEarn,
          agentBonusBalanceAfter: Math.round(bonusBalance + totalBonusToEarn),
          paidByBonusPoints: 0
        },
        needVerification: false
      };

      console.log(JSON.stringify(result, null, 2));
      return res.status(200).json(result);
    }

    const maxBonusSpend = Math.round((totalSum * maxBonusSpendPercent) / 100);
    const bonusValueToSpend = Math.min(preferredBonusToSpend || bonusBalance, maxBonusSpend);

    const totalSumAfterDiscount = discount ? totalSum - (totalSum * discount / 100) : totalSum;
    const discountPercentForBonuses = (bonusValueToSpend / totalSumAfterDiscount) * 100;

    const updatedPositions = productDetails.map((position) => {
      const productPathName = position.productDetails.pathName || "";

      const priceAfterDiscount = discount ? position.price - (position.price * discount / 100) : position.price;
      const finalPriceAfterBonuses = priceAfterDiscount - (priceAfterDiscount * discountPercentForBonuses / 100);

      if (position.restrictCashback) {
        return {
          assortment: position.assortment,
          quantity: position.quantity,
          price: position.price.toFixed(2),
          discountPercent: discountPercentForBonuses.toFixed(2),
          discountedPrice: finalPriceAfterBonuses.toFixed(2),
          bonusValueToEarn: 0
        };
      }

      const limitedEarnPercent = position.fixedCashback !== null ? position.fixedCashback : (isLimitedCategory(productPathName) ? 5 : earnPercent);

      const bonusValueToEarn = Math.round((finalPriceAfterBonuses * position.quantity * limitedEarnPercent) / 100);

      return {
        assortment: position.assortment,
        quantity: position.quantity,
        price: position.price.toFixed(2),
        discountPercent: discountPercentForBonuses.toFixed(2),
        discountedPrice: finalPriceAfterBonuses.toFixed(2),
        bonusValueToEarn 
      };
    });

    const totalBonusValueToEarn = updatedPositions.reduce((total, position) => total + position.bonusValueToEarn, 0);
    const agentBonusBalanceAfter = bonusBalance - bonusValueToSpend + totalBonusValueToEarn;

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
      positions: updatedPositions.map(({ bonusValueToEarn, ...rest }) => rest),
      bonusProgram: {
        transactionType: "SPENDING",
        agentBonusBalance: bonusBalance,
        bonusValueToSpend: bonusValueToSpend,
        bonusValueToEarn: totalBonusValueToEarn,
        agentBonusBalanceAfter: agentBonusBalanceAfter,
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

app.post("/roman/retaildemand", async (req, res) => {
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
    
    let updatedTags = [...tags];

    let bonusField = null;
    if (counterparty.attributes && counterparty.attributes.length > 0) {
      bonusField = counterparty.attributes.find((attr) => attr.name === "Бонусы");
      if (bonusField) {
        bonusField.value = bonusField.value - retaildemand.bonusProgram.bonusValueToSpend + retaildemand.bonusProgram.bonusValueToEarn;
      }
    }

    let groupChanged = false;

    const levels = ["silver", "gold", "platinum"];
    updatedTags = updatedTags.filter(tag => !levels.includes(tag));
    let sales = salesAmount + retaildemand.cashSum + retaildemand.noCashSum;

    if (sales >= 0 && sales <= 9999) {
      updatedTags.push("silver");
      groupChanged = true;
    } else if (sales >= 10000 && sales <= 29999) {
      updatedTags.push("gold");
      groupChanged = true;
    } else if (sales >= 30000) {
      updatedTags.push("platinum");
      groupChanged = true;
    }

    if (groupChanged || bonusField) {
      const updatedData = { tags: updatedTags };
      if (bonusField) updatedData.attributes = [bonusField];

      const updateResponse = await axios.put(
        `https://api.moysklad.ru/api/remap/1.2/entity/counterparty/${retaildemand.agent.meta.id}`,
        updatedData,
        {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(updateResponse.data);
    }

    res.status(201).send();
  } catch (error) {
    console.error("Ошибка при запросе к API МойСклад:", error);
    res.status(500).json({ error: "Ошибка при запросе к API МойСклад" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
