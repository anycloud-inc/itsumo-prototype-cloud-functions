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

http("scraping-rakuten-product-reviews", async (req, res) => {
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
  page.setDefaultNavigationTimeout(0)
  await page.goto(body.siteUrl)
  await page.waitForSelector(".button--3SNaj") // レビューボタンが表示されるまで待つ
  await page.click('a[href^="https://review.rakuten.co.jp"]')

  const reviewSortBtnClassName = ".revRvwSortTurn"
  // 参考になるレビュー順で表示するため、ソートボタンが表示されるまで待つ
  await page.waitForSelector(reviewSortBtnClassName)
  await page.click('a[l2id_linkname="search_03"]')

  // 同じページの遷移のため、documentをリセットするためにページをリロードする
  // リロードしないと、遷移前のレビューを取得してしまう
  await page.reload()
  const reviewItemClassName = ".revRvwUserEntryCmt"

  // レビューが表示されるまで待つ
  await page.waitForSelector(reviewSortBtnClassName)

  // 総合評価の取得
  const comprehensiveEvalElement = await page.$(".revEvaNumber")
  const comprehensiveEval = await (
    await comprehensiveEvalElement?.getProperty("innerText")
  )?.jsonValue()

  // 評価件数の取得
  const totalEvalCountElement = await page.$(".revEvaCount > .Count")
  const totalEvalCount = await (
    await totalEvalCountElement?.getProperty("innerText")
  )?.jsonValue()

  // 1ページ目のレビューの取得（最大15件）
  const list = await page.$$(reviewItemClassName)
  let reviews = []
  for (let i = 0; i < list.length; i++) {
    reviews.push(await (await list[i].getProperty("textContent"))?.jsonValue())
  }

  await browser.close()

  res.status(200).json({
    comprehensiveEval,
    totalEvalCount,
    reviews,
  })
})
