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

  const getImageUrls = async () => {
    try {
      await page.waitForSelector(".sale_desc", { timeout: 10000 })
      return await page.$$eval("span.sale_desc img", (list) =>
        list.map((el) => (el as HTMLImageElement).src)
      )
    } catch (e) {
      console.log(e)
      return []
    }
  }
  const imageUrls = await getImageUrls()

  const getItemDesc = async (): Promise<{
    itemDescText: string | null
    imageUrls: string[]
  }> => {
    try {
      await page.waitForSelector(".item_desc", { timeout: 10000 })
      const itemDescText: string | null = await page.$eval(
        ".item_desc",
        (el) => el.textContent
      )

      const imageUrls = await page.$$eval("span.item_desc img", (list) =>
        list.map((el) => (el as HTMLImageElement).src)
      )

      return { itemDescText, imageUrls }
    } catch (e) {
      console.log(e)
      return { itemDescText: "", imageUrls: [] }
    }
  }

  const { itemDescText, imageUrls: itemDescImageUrls } = await getItemDesc()

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
      imageUrls: [...imageUrls, ...itemDescImageUrls],
      name: itemNameText?.trim(),
      description: itemDescText?.trim(),
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

  const isExistSelector = async (selector: string) => {
    try {
      await page.waitForSelector(selector, { timeout: 10000 })
      return true
    } catch (e) {
      console.log(e)
      return false
    }
  }

  const isExistReviewLink = async () => {
    const [pageItemReviews, reviewButton, reviewLink] = await Promise.all([
      isExistSelector(".page_item_reviews"),
      isExistSelector(".button--3SNaj"),
      isExistSelector(".link--_SR9y"),
    ])
    return pageItemReviews || reviewButton || reviewLink
  }

  // レビューページのリンクを持つ要素が表示されるまで待つ
  const isExistReviewLinkResult = await isExistReviewLink()
  if (!isExistReviewLinkResult) {
    await browser.close()
    res.status(200).json({
      comprehensiveEval: "",
      totalEvalCount: "",
      reviews: [],
    })
  }

  // hrefに「https://review.rakuten.co.jp/item」を含む要素をクリックして、レビューページに遷移する
  await page.click('a[href^="https://review.rakuten.co.jp/item"]')

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

http("scraping-amazon-product-reviews", async (req, res) => {
  try {
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

    // cookieが存在しないと、ロボット判定されて商品ｎページにアクセスできないため、
    // スクレイピング対策されていない、プライバシー規約のページにアクセスしてcookieを取得する
    await page.goto(
      "https://www.amazon.co.jp/gp/help/customer/display.html/ref=hp_gt_sp_prnt?nodeId=GX7NJQ4ZB8MHFRNJ"
    )
    await page.goto(body.siteUrl)

    const isExistReviewLink = async () => {
      try {
        await page.waitForSelector("a[data-hook='see-all-reviews-link-foot']", {
          timeout: 10000,
        })
        return true
      } catch (e) {
        console.log(e)
        return false
      }
    }

    // レビューページのリンクを持つ要素が表示されるまで待つ
    const isExistReviewLinkResult = await isExistReviewLink()
    if (!isExistReviewLinkResult) {
      await browser.close()
      res.status(200).json({
        comprehensiveEval: "",
        totalEvalCount: "",
        reviews: [],
      })
    }

    await page.click("a[data-hook='see-all-reviews-link-foot']")
    await page.reload()

    const isExistReviewText = async () => {
      try {
        await page.waitForSelector("span[data-hook='rating-out-of-text']", {
          timeout: 10000,
        })
        return true
      } catch (e) {
        console.log(e)
        return false
      }
    }

    // レビューが表示されるまで待つ
    const isExistReviewTextResult = await isExistReviewText()
    if (!isExistReviewTextResult) {
      await browser.close()
      res.status(200).json({
        comprehensiveEval: "",
        totalEvalCount: "",
        reviews: [],
      })
    }

    // 総合評価の取得
    const comprehensiveEvalElement = await page.$(
      "span[data-hook='rating-out-of-text']"
    )
    const comprehensiveEval = await (
      await comprehensiveEvalElement?.getProperty("innerText")
    )?.jsonValue()

    // 評価件数の取得
    const totalEvalCountElement = await page.$(
      "div[data-hook='total-review-count']"
    )
    const totalEvalCountText: string | undefined = await (
      await totalEvalCountElement?.getProperty("innerText")
    )?.jsonValue()
    const totalEvalCount = totalEvalCountText?.replace(/[^0-9]/g, "")

    // 1ページ目のレビューの取得（最大10件）
    const reviews = await page.$$eval(
      "span[data-hook='review-body']",
      (list) => {
        return list.map((data) => data.textContent?.trim())
      }
    )
    await browser.close()

    res.status(200).json({ comprehensiveEval, totalEvalCount, reviews })
  } catch (e) {
    console.log(e)
    res.status(500).json({ success: false })
  }
})
