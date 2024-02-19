import { http } from '@google-cloud/functions-framework'
import puppeteer from 'puppeteer-core'
import chromium from 'chrome-aws-lambda'

http('scraping-rakuten-product-detail', async (req, res) => {
  const body = JSON.parse(req.body)
  const options =
    process.env.NODE_ENV === 'production'
      ? {
          args: chromium.args,
          executablePath: await chromium.executablePath,
          headless: chromium.headless,
        }
      : {
          args: [],
          executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          headless: false,
        }

  const browser = await puppeteer.launch(options)
  const page = await browser.newPage()
  await page.goto(body.siteUrl)

  const getSaleDesc = async (): Promise<{
    saleDescText: string
    saleDescImageUrls: string[]
  }> => {
    try {
      await page.waitForSelector('.sale_desc', { timeout: 10000 })
      const saleDescText: string = (await page.$eval(
        '.sale_desc',
        (el) => el.textContent,
      )) as string

      const saleDescImageUrls = await page.$$eval('span.sale_desc img', (list) =>
        list.map((el) => (el as HTMLImageElement).src),
      )
      return { saleDescText, saleDescImageUrls }
    } catch (e) {
      console.log(e)
      return { saleDescText: '', saleDescImageUrls: [] }
    }
  }
  const { saleDescText, saleDescImageUrls } = await getSaleDesc()

  const getItemDesc = async (): Promise<{
    itemDescText: string
    itemDescImageUrls: string[]
  }> => {
    try {
      await page.waitForSelector('.item_desc', { timeout: 10000 })
      const itemDescText = (await page.$eval('.item_desc', (el) => el.textContent)) as string

      const itemDescImageUrls = await page.$$eval('span.item_desc img', (list) =>
        list.map((el) => (el as HTMLImageElement).src),
      )

      return { itemDescText, itemDescImageUrls }
    } catch (e) {
      console.log(e)
      return { itemDescText: '', itemDescImageUrls: [] }
    }
  }

  const { itemDescText, itemDescImageUrls } = await getItemDesc()

  const itemName = await page.$('.normal_reserve_item_name')
  const itemNameText: string | undefined = await (
    await itemName?.getProperty('innerText')
  )?.jsonValue()

  const price = await page.$eval('#priceCalculationConfig', (el) => el.getAttribute('data-price'))

  // 価格横の画像
  const getNextToPriceImageUrls = async (): Promise<{ nextToPriceImageUrls: string[] }> => {
    try {
      await page.waitForSelector('.image--3z5RH', { timeout: 10000 })
      const nextToPriceImageUrls = await page.$$eval('.image--3z5RH', (list) =>
        list.map((el) => (el as HTMLImageElement).src),
      )
      return { nextToPriceImageUrls }
    } catch (e) {
      console.log(e)
      return { nextToPriceImageUrls: [] }
    }
  }
  const { nextToPriceImageUrls } = await getNextToPriceImageUrls()

  // 限定画像
  const getLimitedImages = async (): Promise<{ limitedImageUrls: string[] }> => {
    try {
      await page.waitForSelector('td.rakutenLimitedId_GPImage img', { timeout: 10000 })
      const limitedImageUrls = await page.$$eval('td.rakutenLimitedId_GPImage img', (list) =>
        list.map((el) => (el as HTMLImageElement).src),
      )
      return { limitedImageUrls }
    } catch (e) {
      console.log(e)
      return { limitedImageUrls: [] }
    }
  }
  const { limitedImageUrls } = await getLimitedImages()

  // 商品使用
  const getSpec = async (): Promise<{ specText: string }> => {
    try {
      await page.waitForSelector('.normal-reserve-specTableArea', { timeout: 10000 })
      const specText = (await page.$eval(
        '.normal-reserve-specTableArea',
        (el) => el.textContent,
      )) as string
      return { specText }
    } catch (e) {
      console.log(e)
      return { specText: '' }
    }
  }
  const { specText } = await getSpec()

  // レビュー前の商品情報
  const getExt = async (): Promise<{
    extText: string
    extImageUrls: string[]
  }> => {
    try {
      await page.waitForSelector('td.exT_sdtext', { timeout: 10000 })
      const extText = (await page.$eval('td.exT_sdtext', (el) => el.textContent)) as string

      const extImageUrls = await page.$$eval('td.exT_sdtext img', (list) =>
        list.map((el) => (el as HTMLImageElement).src),
      )
      return { extText, extImageUrls }
    } catch (e) {
      console.log(e)
      return { extText: '', extImageUrls: [] }
    }
  }
  const { extText, extImageUrls } = await getExt()

  // レビュー
  const getReviews = async (): Promise<{ reviewsText: string }> => {
    const reviewsSelector = "[data-ratid='ratReviewParts']"
    try {
      await page.waitForSelector(reviewsSelector, { timeout: 10000 })
      const reviewsText = (await page.$eval(reviewsSelector, (el) => el.textContent)) as string
      return { reviewsText }
    } catch (e) {
      console.log(e)
      return { reviewsText: '' }
    }
  }
  const { reviewsText } = await getReviews()

  await browser.close()

  res.status(200).json({
    item: {
      imageUrls: [
        ...saleDescImageUrls,
        ...itemDescImageUrls,
        ...nextToPriceImageUrls,
        ...extImageUrls,
        ...limitedImageUrls,
      ],
      name: itemNameText?.trim(),
      description:
        saleDescText.trim() +
        itemDescText.trim() +
        specText.trim() +
        extText.trim() +
        reviewsText.trim(),
      price: `${price}円`,
    },
  })
})

http('scraping-rakuten-product-reviews', async (req, res) => {
  const body = JSON.parse(req.body)
  const options =
    process.env.NODE_ENV === 'production'
      ? {
          args: chromium.args,
          executablePath: await chromium.executablePath,
          headless: chromium.headless,
        }
      : {
          args: [],
          executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          headless: false,
        }

  const browser = await puppeteer.launch(options)
  const page = await browser.newPage()
  page.setDefaultNavigationTimeout(0)
  await page.goto(body.siteUrl)

  // hrefに「https://review.rakuten.co.jp/item」を含むaタグのhref属性を取得する
  // NOTE: aタグをクリックして遷移すると、ページ遷移処理が上手く動作しないときがあるため、hrefを取得して直接遷移する
  const getReviewsUrl = async (selector: string) => {
    try {
      await page.waitForSelector(selector, { timeout: 10000 })
      return await page.$eval(selector, (el) => el.getAttribute('href'))
    } catch (e) {
      console.log(e)
      return null
    }
  }

  const [seeReviewButtonLink, pageItemReviewsLink] = await Promise.all([
    getReviewsUrl("span[irc='SeeReviewButton'] a[href^='https://review.rakuten.co.jp/item']"),
    getReviewsUrl(".page_item_reviews a[href^='https://review.rakuten.co.jp/item']"),
  ])

  const href = seeReviewButtonLink || pageItemReviewsLink

  if (href == null) {
    await browser.close()
    res.status(200).json({
      comprehensiveEval: '',
      totalEvalCount: '',
      reviews: [],
    })
  }

  // レビューページに遷移する
  await page.goto(href!)
  const reviewSortBtnClassName = '.revRvwSortTurn'

  // 参考になるレビュー順で表示するため、ソートボタンが表示されるまで待つ
  await page.waitForSelector(reviewSortBtnClassName, { timeout: 10000 })
  await page.click('a[l2id_linkname="search_03"]')

  // 同じページの遷移のため、documentをリセットするためにページをリロードする
  // リロードしないと、遷移前のレビューを取得してしまう
  await page.reload()
  const reviewItemClassName = '.revRvwUserEntryCmt'

  // レビューが表示されるまで待つ
  await page.waitForSelector(reviewSortBtnClassName)

  // 総合評価の取得
  const comprehensiveEvalElement = await page.$('.revEvaNumber')
  const comprehensiveEval = await (
    await comprehensiveEvalElement?.getProperty('innerText')
  )?.jsonValue()

  // 評価件数の取得
  const totalEvalCountElement = await page.$('.revEvaCount > .Count')
  const totalEvalCount = await (await totalEvalCountElement?.getProperty('innerText'))?.jsonValue()

  // 1ページ目のレビューの取得（最大15件）
  const list = await page.$$(reviewItemClassName)
  let reviews = []
  for (let i = 0; i < list.length; i++) {
    reviews.push(await (await list[i].getProperty('textContent'))?.jsonValue())
  }

  await browser.close()

  res.status(200).json({
    comprehensiveEval,
    totalEvalCount,
    reviews,
  })
})

http('scraping-amazon-product-reviews', async (req, res) => {
  try {
    const body = JSON.parse(req.body)
    const options =
      process.env.NODE_ENV === 'production'
        ? {
            args: chromium.args,
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
          }
        : {
            args: [],
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: false,
          }

    const browser = await puppeteer.launch(options)
    const page = await browser.newPage()

    // cookieが存在しないと、ロボット判定されて商品ｎページにアクセスできないため、
    // スクレイピング対策されていない、プライバシー規約のページにアクセスしてcookieを取得する
    await page.goto(
      'https://www.amazon.co.jp/gp/help/customer/display.html/ref=hp_gt_sp_prnt?nodeId=GX7NJQ4ZB8MHFRNJ',
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
        comprehensiveEval: '',
        totalEvalCount: '',
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
        comprehensiveEval: '',
        totalEvalCount: '',
        reviews: [],
      })
    }

    // 総合評価の取得
    const comprehensiveEvalElement = await page.$("span[data-hook='rating-out-of-text']")
    const comprehensiveEval = await (
      await comprehensiveEvalElement?.getProperty('innerText')
    )?.jsonValue()

    // 評価件数の取得
    const totalEvalCountElement = await page.$("div[data-hook='total-review-count']")
    const totalEvalCountText: string | undefined = await (
      await totalEvalCountElement?.getProperty('innerText')
    )?.jsonValue()
    const totalEvalCount = totalEvalCountText?.replace(/[^0-9]/g, '')

    // 1ページ目のレビューの取得（最大10件）
    const reviews = await page.$$eval("span[data-hook='review-body']", (list) => {
      return list.map((data) => data.textContent?.trim())
    })
    await browser.close()

    res.status(200).json({ comprehensiveEval, totalEvalCount, reviews })
  } catch (e) {
    console.log(e)
    res.status(500).json({ success: false })
  }
})

http('scraping-amazon-product-detail', async (req, res) => {
  try {
    const body = JSON.parse(req.body)
    const options =
      process.env.NODE_ENV === 'production'
        ? {
            args: [...chromium.args, '--lang=ja'],
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
          }
        : {
            args: [],
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: false,
          }

    const browser = await puppeteer.launch(options)
    const page = await browser.newPage()
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP' }) // 本番環境で英語となったのでpuppeteerの言語を日本語に変える

    // cookieが存在しないと、ロボット判定されて商品ｎページにアクセスできないため、
    // スクレイピング対策されていない、プライバシー規約のページにアクセスしてcookieを取得する
    await page.goto(
      'https://www.amazon.co.jp/gp/help/customer/display.html/ref=hp_gt_sp_prnt?nodeId=GX7NJQ4ZB8MHFRNJ',
    )
    await page.goto(body.siteUrl)

    await page.reload()

    const isExistSelector = async (selector: string) => {
      try {
        await page.waitForSelector(selector, { timeout: 10000 })
        return true
      } catch (e) {
        console.log(e)
        return false
      }
    }

    // 必要な情報が揃うカスタマーレビューが表示されるまで待つ
    const costomerReviewsSelector = 'div#customerReviews'
    const isExistTitle = await isExistSelector(costomerReviewsSelector)
    if (!isExistTitle) {
      await browser.close()
      res.status(200).json({
        productNameText: '',
        priceText: '',
        thumbnailImageUrl: '',
        productOverviewText: '',
        featureBulletsText: '',
        productDetailsText: '',
        filteredAplusImageUrls: [],
        productDescriptionText: '',
        importantInformationText: '',
      })
    }

    // タイトル
    const titleSelector = 'span#productTitle'
    const productName = await page.$(titleSelector)
    const productNameText: string | undefined = await (
      await productName?.getProperty('innerText')
    )?.jsonValue()

    // 価格
    const priceSelector = "[id^='corePrice']"
    const price = await page.$(priceSelector)
    const priceText: string | undefined = await (await price?.getProperty('innerText'))?.jsonValue()

    // サムネイル画像
    const thumbnailImageSelector = 'img#landingImage'
    const thumbnailImageUrl = await page.$eval(
      thumbnailImageSelector,
      (el) => (el as HTMLImageElement).src,
    )

    // テーブル情報
    const productOverviewSelector = "[id^='productOverview']"
    const productOverview = await page.$(productOverviewSelector)
    const productOverviewText: string | undefined = await (
      await productOverview?.getProperty('innerText')
    )?.jsonValue()

    // 「この商品について」
    const featureBulletsSelector = "[id^='feature-bullets']"
    const featureBullets = await page.$(featureBulletsSelector)
    const featureBulletsText: string | undefined = await (
      await featureBullets?.getProperty('innerText')
    )?.jsonValue()

    // 「商品の情報」
    const productDetailsSelector = "[id^='productDetails']"
    const productDetails = await page.$(productDetailsSelector)
    const productDetailsText: string | undefined = await (
      await productDetails?.getProperty('innerText')
    )?.jsonValue()

    // 「商品の説明」(aplus)
    const aplusSelector = 'div#aplus img'
    const getAplusImageUrls = async () => {
      try {
        await page.waitForSelector('.aplus-module', { timeout: 10000 })
        return await page.$$eval(aplusSelector, (list) =>
          list.map((el) => (el as HTMLImageElement).getAttribute('data-src')),
        )
      } catch (e) {
        console.log(e)
        return []
      }
    }
    const aplusImageUrls = await getAplusImageUrls()
    const filteredAplusImageUrls = aplusImageUrls.filter((url) => url !== null) // aplus内の比較グラフの画像の場合, data-srcはないのでnullとなる

    // 「商品の説明」（productDescription）
    const productDescriptionSelector = "[id^='productDescription']"
    const productDescription = await page.$(productDescriptionSelector)
    const productDescriptionText: string | undefined = await (
      await productDescription?.getProperty('innerText')
    )?.jsonValue()

    // 「重要なお知らせ」
    const importantInformationSelector = "[id^='importantInformation']"
    const importantInformation = await page.$(importantInformationSelector)
    const importantInformationText: string | undefined = await (
      await importantInformation?.getProperty('innerText')
    )?.jsonValue()

    await browser.close()

    res.status(200).json({
      productNameText,
      priceText,
      thumbnailImageUrl,
      productOverviewText,
      featureBulletsText,
      productDetailsText,
      filteredAplusImageUrls,
      productDescriptionText,
      importantInformationText,
    })
  } catch (e) {
    console.log(e)
    res.status(500).json({ success: false })
  }
})
