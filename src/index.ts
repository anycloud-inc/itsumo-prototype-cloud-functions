import { http } from "@google-cloud/functions-framework"
import puppeteer from "puppeteer-core"
import chromium from "chrome-aws-lambda"

http("scraping-rakuten-product-detail", async (req, res) => {
  const body = JSON.parse(req.body)
  const options =
    process.env.NODE_ENV === "production"
      ? {
          args: chromium.args,
          executablePath: await chromium.executablePath,
          headless: chromium.headless,
        }
      : {
          args: [],
          executablePath:
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          headless: false,
        }

  const browser = await puppeteer.launch(options)
  const page = await browser.newPage()
  await page.goto(body.siteUrl)
  await page.waitForSelector(".sale_desc")

  const imageUrls = await page.$$eval("span.sale_desc img", (list) =>
    list.map((el) => (el as HTMLImageElement).src)
  )

  const itemDesc = await page.$(".item_desc")
  const itemDsecText: string | undefined = await (
    await itemDesc?.getProperty("innerText")
  )?.jsonValue()

  const itemName = await page.$(".normal_reserve_item_name")
  const itemNameText: string | undefined = await (
    await itemName?.getProperty("innerText")
  )?.jsonValue()

  const price = await page.$eval("#priceCalculationConfig", (el) =>
    el.getAttribute("data-price")
  )

  await browser.close()

  res.status(200).json({
    item: {
      imageUrls,
      name: itemNameText?.trim(),
      description: itemDsecText?.trim(),
      price: `${price}円`,
    },
  })
})
