// load env
require('dotenv').config()

const ora = require('ora')
const spinners = require('cli-spinners')

const spinner = ora()
spinner.spinner = spinners.line

// load puppeteer
const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker')

const getCnaContent = require('./getCnaContent')
const getStraitsTimesContent = require('./getStraitsTimesContent')
const getMothershipContent = require('./getMothershipContent')

const headlineInit = async function (url) {
  try {
    puppeteer.use(StealthPlugin())
    puppeteer.use(AdblockerPlugin({ blockTrackers: true }))

    const args = [
      '--headless',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36',
    ]

    spinner.start('Initializing Puppeteer and establishing a connection to the browser...')

    const browser = await puppeteer.launch({
      ignoreHTTPSErrors: true,
      args,
    })

    const page = await browser.newPage({ ignoreHTTPSErrors: true })

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 0 })

    spinner.info(`Navigating to the news article URL: ${url}...`)

    const pageData = await page.evaluate((url) => {
      const data = []

      // capture latest news title and its links
      let headlineDOM
      if (url.includes('channelnewsasia')) {
        headlineDOM = document.querySelectorAll(
          'article div div.layout--onecol:nth-child(2) a.list-object__heading-link',
        )
      } else if (url.includes('straitstimes')) {
        headlineDOM = document.querySelectorAll('div.top-stories-area div.content a.stretched-link')
      } else {
        headlineDOM = document.querySelectorAll('div#latest-news div.ind-article')
      }

      headlineDOM.forEach((item) => {
        if (url.includes('mothership')) {
          const header = item.querySelector(`a div.header h1`)
          const link = item.querySelector(`a`)
          data.push({ [header.innerText]: link.href })
        } else {
          data.push({ [item.innerText]: item.href })
        }
      })

      return data
    }, url)

    spinner.succeed(`Extracting total of ${pageData.length} news articles for processing...`)

    const resData = []

    for (let i = 0; i < pageData.length; i++) {
      const newsTitle = Object.keys(pageData[i])
      const newsUrl = Object.values(pageData[i])
      let res
      let source

      spinner.start(
        `Sending the news article content to the OpenAI for summarization. Progress: ${i + 1}/${pageData.length}...`,
      )

      if (url.includes('channelnewsasia')) {
        res = await getCnaContent(page, newsUrl[0])
        source = 'CNA'
      } else if (url.includes('straitstimes')) {
        res = await getStraitsTimesContent(page, newsUrl[0])
        source = 'Strait Times'
      } else {
        res = await getMothershipContent(page, newsUrl[0])
        source = 'Mothership'
      }

      resData.push({
        title: newsTitle[0],
        data: res.data,
        img: res.img,
        url: newsUrl[0],
        source,
      })
    }

    spinner.succeed(`Summary generated successfully.`)

    console.log(resData)
    await browser.close()
  } catch (err) {
    console.log(err)
    spinner.fail(err)
    process.exit(1)
  }
}

module.exports = headlineInit
